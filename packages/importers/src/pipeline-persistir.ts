import type { RawRecord } from './raw-record.js'
import { CatalogDao } from '@netatlas/data'
import type { BatchReport, ConflictoDetalle, ImportDeps, PersistResult, Reconciliation } from './pipeline-tipos.js'

/**
 * ETAPA 6 del pipeline de importación (§19.2): persistencia transaccional por
 * lote. Ante cualquier error duro hace rollback completo; los registros
 * rechazados por validación o marcados como conflicto se excluyen sin tocar el
 * resto (nunca medio-escrito, criterio 28.1.6#5).
 */

/** ETAPA 6 — persiste en transacción única de lote (rollback ante error duro). */
export function persistir(
  records: readonly RawRecord[],
  validos: readonly RawRecord[],
  reconciliaciones: readonly Reconciliation[],
  deps: ImportDeps,
  reescritura?: ReadonlyMap<string, string>,
  conflictos?: readonly ConflictoDetalle[],
): PersistResult {
  const dao = new CatalogDao(deps.driver)
  const conflictosDetalle = conflictos ?? []
  const report = construirReporte(records, validos, reconciliaciones, conflictosDetalle)
  const validosSinConflicto = filtrarValidos(validos, conflictosDetalle)
  if (validosSinConflicto.length === 0) return { report, persisted: 0 }

  const conteo = persistirLote(deps, dao, validosSinConflicto, reconciliaciones, reescritura)
  return { report: { ...report, ...conteo }, persisted: validosSinConflicto.length }
}

/** Escribe el lote válido en transacción única y devuelve altas/actualizaciones. */
function persistirLote(
  deps: ImportDeps,
  dao: CatalogDao,
  validos: readonly RawRecord[],
  reconciliaciones: readonly Reconciliation[],
  reescritura?: ReadonlyMap<string, string>,
): { altas: number; actualizaciones: number } {
  const conteo = { altas: 0, actualizaciones: 0 }
  const now = new Date().toISOString()
  const reescribir = reescritura ?? new Map<string, string>()
  deps.driver.transaction(() => {
    for (const r of validos) contarRegistro(dao, r, reconciliaciones, reescribir, now, conteo)
  })
  return conteo
}

/** Persiste un registro y suma altas o actualizaciones según proceda. */
function contarRegistro(
  dao: CatalogDao,
  r: RawRecord,
  reconciliaciones: readonly Reconciliation[],
  reescribir: ReadonlyMap<string, string>,
  now: string,
  conteo: { altas: number; actualizaciones: number },
): void {
  const slugEntrante = r.device.slug!
  const status = reconciliaciones.find((x) => x.slug === slugEntrante)?.status ?? 'nuevo'
  const existed = persistirDispositivo(dao, r, reescribir, now)
  // Alta si la reconciliación lo dio de nuevo o no había registro previo.
  if (status === 'nuevo' || !existed) conteo.altas++
  else conteo.actualizaciones++
}

/** Informe base con los totales que no dependen de la escritura. */
function construirReporte(
  records: readonly RawRecord[],
  validos: readonly RawRecord[],
  reconciliaciones: readonly Reconciliation[],
  conflictosDetalle: readonly ConflictoDetalle[],
): BatchReport {
  return {
    total: records.length,
    altas: 0,
    actualizaciones: 0,
    conflictos: conflictosDetalle.length,
    rechazos: records.length - validos.length,
    sinCambio: 0,
    validaciones: [],
    reconciliaciones: [...reconciliaciones],
    conflictosDetalle,
  }
}

/** Excluye del lote las entradas marcadas como candidato a revisión. */
function filtrarValidos(validos: readonly RawRecord[], conflictosDetalle: readonly ConflictoDetalle[]): readonly RawRecord[] {
  const excluir = new Set(conflictosDetalle.map((c) => c.entradaSlug))
  return validos.filter((r) => !excluir.has(r.device.slug!))
}

/** Escribe un dispositivo completo; devuelve true si ya existía previamente. */
function persistirDispositivo(dao: CatalogDao, r: RawRecord, reescribir: ReadonlyMap<string, string>, now: string): boolean {
  const d = r.device
  const slugReal = reescribir.get(d.slug!) ?? d.slug!
  const existed = dao.deviceId(slugReal) !== undefined
  dao.upsertDevice({
    slug: slugReal,
    name: d.name,
    manufacturerSlug: d.manufacturerSlug,
    categoryCode: d.categoryCode,
    lifecycleStatus: d.lifecycleStatus,
    osiProfileJson: d.osiProfile ? JSON.stringify(d.osiProfile) : undefined,
    summary: d.summary,
  })
  const deviceId = dao.deviceId(slugReal)!
  persistirPuertos(dao, d, slugReal)
  persistirAfirmaciones(dao, d, deviceId, now)
  persistirRelaciones(dao, d, deviceId)
  return existed
}

/** Puertos: reemplazo completo (idempotente). */
function persistirPuertos(dao: CatalogDao, d: RawRecord['device'], slugReal: string): void {
  dao.clearPorts(slugReal)
  for (const p of d.ports ?? []) {
    dao.addPort({ deviceSlug: slugReal, interfaceCode: p.interfaceCode, label: p.label, quantity: p.quantity, speedsMbps: p.speedsMbps, poeStandard: p.poeStandard, role: p.role })
  }
}

/** Assertions → relación supports-protocol (assertion_id enlazado). */
function persistirAfirmaciones(dao: CatalogDao, d: RawRecord['device'], deviceId: number, now: string): void {
  for (const a of d.assertions ?? []) {
    const assertionId = dao.addAssertion({
      subjectType: 'device',
      subjectId: deviceId,
      predicate: a.predicate,
      valueJson: JSON.stringify(a.value),
      sourceSlug: a.sourceSlug,
      confidence: a.confidence ?? 'derived',
      verifiedOn: a.verifiedOn ?? now.slice(0, 10),
      author: 'import-cli',
    })
    if (a.predicate === 'supports-protocol' && typeof a.value === 'string') {
      dao.addRelationship({
        subjectType: 'device',
        subjectId: deviceId,
        predicate: 'supports-protocol',
        objectType: 'protocol',
        objectId: dao.protocolId(a.value),
        assertionId,
      })
    }
  }
}

/** Relaciones explícitas del registro (los extremos no resolubles se omiten). */
function persistirRelaciones(dao: CatalogDao, d: RawRecord['device'], deviceId: number): void {
  const resolvers: Record<string, (s: string) => number | undefined> = {
    layer: (s: string) => dao.seedLayerId(s),
    device: (s: string) => dao.deviceId(s),
  }
  for (const rel of d.relationships ?? []) {
    const objectId = resolvers[rel.objectType]?.(rel.objectSlug)
    if (objectId === undefined) continue
    dao.addRelationship({ subjectType: 'device', subjectId: deviceId, predicate: rel.predicate, objectType: rel.objectType, objectId })
  }
}