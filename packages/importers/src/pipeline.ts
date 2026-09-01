import type { RawRecord } from './raw-record.js'
import type { SqliteDriver, SqlRow } from '@netatlas/data'
import { CatalogDao } from '@netatlas/data'
import { isLifecycleStatus, isConfidence, findPredicate, dedupScore, UMBRAL_CANDIDATO } from '@netatlas/domain'

/**
 * Pipeline de importación (§19.2): parse → normaliza → valida → dedup →
 * reconcilia → persiste. Cada etapa es testeable de forma independiente.
 *
 * Etapa 6 (persistir) es transaccional por lote: ante cualquier error duro
 * hace rollback completo; los registros rechazados por validación se excluyen
 * sin tocar el resto (nunca medio-escrito, criterio 28.1.6#5).
 */

export interface ValidationIssue {
  readonly recordIndex: number
  readonly rule: string
  readonly message: string
}

export interface Reconciliation {
  readonly status: 'nuevo' | 'actualizacion' | 'conflicto' | 'sin-cambio'
  readonly slug: string
  readonly detail?: string
}

/** Candidato a revisión humana: par entrante/existente con scoring y diff (F6). */
export interface ConflictoDetalle {
  readonly entradaSlug: string
  readonly existenteSlug: string
  readonly score: number
  readonly diff: readonly { campo: string; entrante: string; existente: string }[]
}

export interface BatchReport {
  readonly total: number
  readonly altas: number
  readonly actualizaciones: number
  readonly conflictos: number
  readonly rechazos: number
  readonly sinCambio: number
  readonly validaciones: readonly ValidationIssue[]
  readonly reconciliaciones: readonly Reconciliation[]
  readonly conflictosDetalle: readonly ConflictoDetalle[]
}

export interface ImportDeps {
  readonly driver: SqliteDriver
  /** Catálogos cerrados para validación de extremos. */
  readonly knownProtocols?: ReadonlySet<string>
  readonly knownStandards?: ReadonlySet<string>
  readonly knownMedia?: ReadonlySet<string>
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '-')
}

/** ETAPA 2 — normaliza: slugs, fechas ISO, fabricante canónico. */
export function normalizar(records: readonly RawRecord[]): RawRecord[] {
  return records.map((r) => {
    const d = r.device
    const slug = d.slug ? normalize(d.slug) : normalize(`${d.manufacturerSlug}-${d.name}`)
    return {
      ...r,
      device: {
        ...d,
        slug,
        manufacturerSlug: normalize(d.manufacturerSlug),
        familySlug: d.familySlug ? normalize(d.familySlug) : undefined,
        releasedOn: d.releasedOn ? (d.releasedOn.match(/^\d{4}-\d{2}-\d{2}$/) ? d.releasedOn : undefined) : undefined,
      },
    }
  })
}

/** ETAPA 3 — valida: esquema, estados, catálogos cerrados, invariantes. */
export function validar(records: readonly RawRecord[], deps: ImportDeps): { validos: RawRecord[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const validos: RawRecord[] = []
  records.forEach((r, idx) => {
    const d = r.device
    const push = (rule: string, message: string): void => { issues.push({ recordIndex: idx, rule, message }) }
    let ok = true

    if (!d.slug || d.slug.trim() === '') { push('slug', 'Slug vacío.'); ok = false }
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) { push('slug', `Slug inválido: "${d.slug}".`); ok = false }

    if (!isLifecycleStatus(d.lifecycleStatus)) {
      push('lifecycle', `Estado de ciclo de vida inválido: "${d.lifecycleStatus}".`); ok = false
    }

    if (d.categoryCode && !/^CAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(d.categoryCode)) {
      push('category', `Código de categoría inválido: "${d.categoryCode}".`); ok = false
    }

    for (const rel of d.relationships ?? []) {
      const spec = findPredicate(rel.predicate)
      if (!spec) {
        push('predicate', `Predicado desconocido: "${rel.predicate}".`); ok = false
      } else if (rel.objectType === 'protocol' && deps.knownProtocols && !deps.knownProtocols.has(rel.objectSlug)) {
        push('closed-catalog', `Protocolo inexistente en catálogo: "${rel.objectSlug}".`); ok = false
      } else if (rel.objectType === 'medium' && deps.knownMedia && !deps.knownMedia.has(rel.objectSlug)) {
        push('closed-catalog', `Medio inexistente en catálogo: "${rel.objectSlug}".`); ok = false
      }
    }

    for (const a of d.assertions ?? []) {
      if (a.confidence !== undefined && !isConfidence(a.confidence)) {
        push('assertion-confidence', `Confianza inválida: "${a.confidence}".`); ok = false
      }
      if (a.sourceSlug.trim() === '') { push('assertion-source', 'Assertion sin fuente.'); ok = false }
      if (a.predicate === 'supports-protocol' && typeof a.value === 'string' && deps.knownProtocols && !deps.knownProtocols.has(a.value)) {
        push('closed-catalog', `Protocolo de assertion inexistente: "${a.value}".`); ok = false
      }
    }

    if (ok) validos.push(r)
  })
  return { validos, issues }
}

export interface DedupKey {
  readonly manufacturerSlug: string
  readonly model: string
}

export function dedupKeyOf(d: RawRecord['device']): DedupKey | undefined {
  const model = (d.model ?? d.name).trim().toLowerCase()
  if (!model) return undefined
  return { manufacturerSlug: d.manufacturerSlug, model }
}

/** ETAPA 4 — dedup por claves naturales (manufacturer+model). */
export function agruparDuplicados(records: readonly RawRecord[]): Map<string, RawRecord[]> {
  const mapa = new Map<string, RawRecord[]>()
  for (const r of records) {
    const k = dedupKeyOf(r.device)
    if (!k) continue
    const key = `${k.manufacturerSlug}|${k.model}`
    const lista = mapa.get(key) ?? []
    lista.push(r)
    mapa.set(key, lista)
  }
  return mapa
}

export interface ReconciliarResultado {
  readonly reconciliaciones: Reconciliation[]
  readonly nuevos: RawRecord[]
  /** Fusión automática (score ≥ 0.98): slug entrante → slug existente. */
  readonly reescritura: ReadonlyMap<string, string>
  /** Candidatos a revisión (0.7–0.98) con score y diff. */
  readonly conflictos: readonly ConflictoDetalle[]
}

/** Estado persistido de los dispositivos para el dedup (manufacturer+model+sku). */
interface Existente {
  readonly slug: string
  readonly manufacturerSlug: string
  readonly model: string
  readonly sku: string
  readonly name: string
}

export interface ReconciliarOpciones {
  /** Notifica cada candidato a revisión (el CLI lo inserta en reconciliation). */
  readonly onConflicto?: (c: ConflictoDetalle) => void
}

/** ETAPA 5 — reconcilia con el estado persistido: clave exacta + dedup con scoring. */
export function reconciliar(
  records: readonly RawRecord[],
  deps: ImportDeps,
  opciones?: ReconciliarOpciones,
): ReconciliarResultado {
  const dao = new CatalogDao(deps.driver)
  const reconciliaciones: Reconciliation[] = []
  const nuevos: RawRecord[] = []
  const reescritura = new Map<string, string>()
  const conflictos: ConflictoDetalle[] = []

  // Índice de existentes (manufacturer|model → lista) para el scoring.
  const existentes = new Map<string, Existente[]>()
  const rows = deps.driver
    .prepare("SELECT d.slug AS slug, m.slug AS manufacturer_slug, COALESCE(d.model, '') AS model, COALESCE(d.sku, '') AS sku, d.name AS name FROM device d JOIN manufacturer m ON m.id = d.manufacturer_id")
    .all() as SqlRow[]
  for (const r of rows) {
    const e: Existente = {
      slug: String(r.slug),
      manufacturerSlug: String(r.manufacturer_slug),
      model: String(r.model).trim().toLowerCase(),
      sku: String(r.sku).trim(),
      name: String(r.name),
    }
    const k = `${e.manufacturerSlug}|${e.model}`
    const lista = existentes.get(k) ?? []
    lista.push(e)
    existentes.set(k, lista)
  }

  for (const r of records) {
    const d = r.device
    const slug = d.slug!

    // 1) Clave natural exacta (slug) → actualización directa.
    if (dao.deviceId(slug) !== undefined) {
      reconciliaciones.push({ status: 'actualizacion', slug })
      nuevos.push(r)
      continue
    }

    // 2) Dedup por (fabricante, modelo) contra existentes con scoring (§19.2-4).
    const modelo = (d.model ?? d.name).trim().toLowerCase()
    const candidatos = existentes.get(`${d.manufacturerSlug}|${modelo}`) ?? []
    if (candidatos.length > 0) {
      let mejor: { e: Existente; score: number } | undefined
      for (const e of candidatos) {
        const eval_ = dedupScore(
          { manufacturerSlug: d.manufacturerSlug, name: d.name, model: d.model, sku: d.sku, categoryCode: d.categoryCode },
          { manufacturerSlug: e.manufacturerSlug, name: e.name, model: e.model, sku: e.sku || undefined },
        )
        if (!mejor || eval_.score > mejor.score) mejor = { e, score: eval_.score }
      }
      if (mejor && mejor.score >= 0.98) {
        // Fusión automática: los datos entrantes se persisten sobre el existente.
        reconciliaciones.push({ status: 'actualizacion', slug, detail: `fusión automática con ${mejor.e.slug} (score ${mejor.score})` })
        reescritura.set(slug, mejor.e.slug)
        nuevos.push(r)
        continue
      }
      if (mejor && mejor.score >= UMBRAL_CANDIDATO) {
        const conflicto: ConflictoDetalle = {
          entradaSlug: slug,
          existenteSlug: mejor.e.slug,
          score: mejor.score,
          diff: [
            { campo: 'name', entrante: d.name, existente: mejor.e.name },
            ...(d.model && mejor.e.model && d.model.trim().toLowerCase() !== mejor.e.model.trim().toLowerCase() ? [{ campo: 'model', entrante: d.model, existente: mejor.e.model }] : []),
          ],
        }
        conflictos.push(conflicto)
        opciones?.onConflicto?.(conflicto)
        reconciliaciones.push({ status: 'conflicto', slug, detail: `candidato a revisión contra ${mejor.e.slug} (score ${mejor.score.toFixed(3)})` })
        continue
      }
    }

    reconciliaciones.push({ status: 'nuevo', slug })
    nuevos.push(r)
  }
  return { reconciliaciones, nuevos, reescritura, conflictos }
}

export interface PersistResult {
  readonly report: BatchReport
  readonly persisted: number
}

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
  const report: BatchReport = {
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
  const acumulado = { altas: 0, actualizaciones: 0 }

  const excluir = new Set(conflictosDetalle.map((c) => c.entradaSlug))
  const reescribir = reescritura ?? new Map<string, string>()
  const validosSinConflicto = validos.filter((r) => !excluir.has(r.device.slug!))

  if (validosSinConflicto.length === 0) return { report, persisted: 0 }

  const now = new Date().toISOString()
  deps.driver.transaction(() => {
    for (const r of validosSinConflicto) {
      const d = r.device
      const slugEntrante = d.slug!
      const slugReal = reescribir.get(slugEntrante) ?? slugEntrante
      const existing = dao.deviceId(slugReal)
      const status = reconciliaciones.find((x) => x.slug === slugEntrante)?.status ?? 'nuevo'
      dao.upsertDevice({
        slug: slugReal,
        name: d.name,
        manufacturerSlug: d.manufacturerSlug,
        categoryCode: d.categoryCode,
        lifecycleStatus: d.lifecycleStatus,
        osiProfileJson: d.osiProfile ? JSON.stringify(d.osiProfile) : undefined,
        summary: d.summary,
      })
      // Puertos: reemplazo completo (idempotente)
      const deviceId = dao.deviceId(slugReal)!
      dao.clearPorts(slugReal)
      for (const p of d.ports ?? []) {
        dao.addPort({ deviceSlug: slugReal, interfaceCode: p.interfaceCode, label: p.label, quantity: p.quantity, speedsMbps: p.speedsMbps, poeStandard: p.poeStandard, role: p.role })
      }
      // Assertions → relación supports-protocol (assertion_id enlazado)
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
      // Relaciones explícitas
      for (const rel of d.relationships ?? []) {
        const resolvers: Record<string, (s: string) => number | undefined> = {
          layer: (s: string) => dao.seedLayerId(s),
          device: (s: string) => dao.deviceId(s),
        }
        const objectId = resolvers[rel.objectType]?.(rel.objectSlug)
        if (objectId === undefined) continue
        dao.addRelationship({ subjectType: 'device', subjectId: deviceId, predicate: rel.predicate, objectType: rel.objectType, objectId })
      }

      if (status === 'nuevo' || existing === undefined) acumulado.altas++
      else acumulado.actualizaciones++
    }
  })

  return { report: { ...report, altas: acumulado.altas, actualizaciones: acumulado.actualizaciones }, persisted: validosSinConflicto.length }
}

export interface RunImportOpciones extends ReconciliarOpciones {}

/**
 * Pipeline completo sobre un driver migrado: normaliza→valida→reconcilia→persiste.
 * El parse lo hace el llamante (parseJson/parseCsv/parseYaml/parseXml).
 */
export function runImport(records: readonly RawRecord[], deps: ImportDeps, opciones?: RunImportOpciones): BatchReport {
  const normalizados = normalizar(records)
  const { validos, issues } = validar(normalizados, deps)
  const { reconciliaciones, reescritura, conflictos } = reconciliar(validos, deps, opciones)
  const { report } = persistir(normalizados, validos, reconciliaciones, deps, reescritura, conflictos)
  return { ...report, validaciones: issues }
}