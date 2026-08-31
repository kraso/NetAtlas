import type { RawRecord } from './raw-record.js'
import type { SqliteDriver } from '@netatlas/data'
import { CatalogDao } from '@netatlas/data'
import { isLifecycleStatus, isConfidence, findPredicate } from '@netatlas/domain'

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

export interface BatchReport {
  readonly total: number
  readonly altas: number
  readonly actualizaciones: number
  readonly conflictos: number
  readonly rechazos: number
  readonly sinCambio: number
  readonly validaciones: readonly ValidationIssue[]
  readonly reconciliaciones: readonly Reconciliation[]
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

/** ETAPA 5 — reconcilia con el estado persistido (por slug). */
export function reconciliar(
  records: readonly RawRecord[],
  deps: ImportDeps,
): { reconciliaciones: Reconciliation[]; nuevos: RawRecord[] } {
  const dao = new CatalogDao(deps.driver)
  const reconciliaciones: Reconciliation[] = []
  const nuevos: RawRecord[] = []
  for (const r of records) {
    const slug = r.device.slug!
    const row = dao.deviceId(slug)
    if (row === undefined) {
      reconciliaciones.push({ status: 'nuevo', slug })
      nuevos.push(r)
    } else {
      reconciliaciones.push({ status: 'actualizacion', slug })
      nuevos.push(r) // Fase 1: upsert; el diff real llega con entity_history (F6)
    }
  }
  return { reconciliaciones, nuevos }
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
): PersistResult {
  const dao = new CatalogDao(deps.driver)
  const report: BatchReport = {
    total: records.length,
    altas: 0,
    actualizaciones: 0,
    conflictos: 0,
    rechazos: records.length - validos.length,
    sinCambio: 0,
    validaciones: [],
    reconciliaciones: [...reconciliaciones],
  }
  const acumulado = { altas: 0, actualizaciones: 0 }

  if (validos.length === 0) return { report, persisted: 0 }

  const now = new Date().toISOString()
  deps.driver.transaction(() => {
    for (const r of validos) {
      const d = r.device
      const existing = dao.deviceId(d.slug!)
      const status = reconciliaciones.find((x) => x.slug === d.slug)?.status ?? 'nuevo'
      dao.upsertDevice({
        slug: d.slug!,
        name: d.name,
        manufacturerSlug: d.manufacturerSlug,
        categoryCode: d.categoryCode,
        lifecycleStatus: d.lifecycleStatus,
        osiProfileJson: d.osiProfile ? JSON.stringify(d.osiProfile) : undefined,
        summary: d.summary,
      })
      // Puertos: reemplazo completo (idempotente)
      const deviceId = dao.deviceId(d.slug!)!
      dao.clearPorts(d.slug!)
      for (const p of d.ports ?? []) {
        dao.addPort({ deviceSlug: d.slug!, interfaceCode: p.interfaceCode, label: p.label, quantity: p.quantity, speedsMbps: p.speedsMbps, poeStandard: p.poeStandard, role: p.role })
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

  return { report: { ...report, altas: acumulado.altas, actualizaciones: acumulado.actualizaciones }, persisted: validos.length }
}

/**
 * Pipeline completo sobre un driver migrado: normaliza→valida→reconcilia→persiste.
 * El parse lo hace el llamante (parseJson/parseCsv).
 */
export function runImport(records: readonly RawRecord[], deps: ImportDeps): BatchReport {
  const normalizados = normalizar(records)
  const { validos, issues } = validar(normalizados, deps)
  const { reconciliaciones } = reconciliar(validos, deps)
  const { report } = persistir(normalizados, validos, reconciliaciones, deps)
  return { ...report, validaciones: issues }
}