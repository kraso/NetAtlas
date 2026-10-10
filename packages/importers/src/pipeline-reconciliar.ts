import type { RawRecord } from './raw-record.js'
import { CatalogDao, type SqlRow } from '@netatlas/data'
import { dedupScore, UMBRAL_CANDIDATO } from '@netatlas/domain'
import type { ConflictoDetalle, Existente, ImportDeps, ReconciliarOpciones, ReconciliarResultado, Reconciliation } from './pipeline-tipos.js'

/**
 * ETAPA 5 del pipeline de importación (§19.2): reconcilia lo entrante contra
 * el estado persistido. Primero la clave exacta (slug) y después el dedup con
 * scoring contra los existentes del mismo fabricante y modelo.
 */

/** Estado en curso de una sola entrada durante la reconciliación. */
interface EstadoRegistro {
  readonly reconciliacion: Reconciliation
  readonly incluir: boolean
}

/** Acumulador mutable que al final se devuelve como contrato inmutable. */
interface Acumulador {
  readonly dao: CatalogDao
  readonly existentes: Map<string, Existente[]>
  readonly reconciliaciones: Reconciliation[]
  readonly nuevos: RawRecord[]
  readonly reescritura: Map<string, string>
  readonly conflictos: ConflictoDetalle[]
}

/** ETAPA 5 — reconcilia con el estado persistido: clave exacta + dedup con scoring. */
export function reconciliar(
  records: readonly RawRecord[],
  deps: ImportDeps,
  opciones?: ReconciliarOpciones,
): ReconciliarResultado {
  const acc = crearAcumulador(deps)
  for (const r of records) aplicarRegistro(acc, r, opciones)
  return resultadoDe(acc)
}

/** Prepara el DAO, el índice de existentes y los acumuladores de la etapa. */
function crearAcumulador(deps: ImportDeps): Acumulador {
  return {
    dao: new CatalogDao(deps.driver),
    existentes: indexarExistentes(deps),
    reconciliaciones: [],
    nuevos: [],
    reescritura: new Map<string, string>(),
    conflictos: [],
  }
}

/** Aplica una entrada al acumulador (reconciliación y alta si procede). */
function aplicarRegistro(acc: Acumulador, r: RawRecord, opciones?: ReconciliarOpciones): void {
  const estado = reconciliarRegistro(acc.dao, acc.existentes, r, acc.reescritura, acc.conflictos, opciones)
  acc.reconciliaciones.push(estado.reconciliacion)
  if (estado.incluir) acc.nuevos.push(r)
}

/** Convierte el acumulador mutable en el contrato inmutable de salida. */
function resultadoDe(acc: Acumulador): ReconciliarResultado {
  return {
    reconciliaciones: acc.reconciliaciones,
    nuevos: acc.nuevos,
    reescritura: acc.reescritura,
    conflictos: acc.conflictos,
  }
}

/** Índice de existentes (manufacturer|model → lista) para el scoring. */
function indexarExistentes(deps: ImportDeps): Map<string, Existente[]> {
  const existentes = new Map<string, Existente[]>()
  for (const r of existentesRows(deps)) agregarExistente(existentes, existenteDe(r))
  return existentes
}

/** Filas ya persistidas de la base, tal cual las devuelve el driver. */
function existentesRows(deps: ImportDeps): SqlRow[] {
  return deps.driver
    .prepare("SELECT d.slug AS slug, m.slug AS manufacturer_slug, COALESCE(d.model, '') AS model, COALESCE(d.sku, '') AS sku, d.name AS name FROM device d JOIN manufacturer m ON m.id = d.manufacturer_id")
    .all() as SqlRow[]
}

/** Fila cruda → `Existente` tipado (campos normalizados). */
function existenteDe(r: SqlRow): Existente {
  return {
    slug: String(r.slug),
    manufacturerSlug: String(r.manufacturer_slug),
    model: String(r.model).trim().toLowerCase(),
    sku: String(r.sku).trim(),
    name: String(r.name),
  }
}

/** Inserta un existente bajo su clave natural (fabricante|modelo). */
function agregarExistente(existentes: Map<string, Existente[]>, e: Existente): void {
  const k = `${e.manufacturerSlug}|${e.model}`
  const lista = existentes.get(k) ?? []
  lista.push(e)
  existentes.set(k, lista)
}

/** Una entrada: actualización directa, fusión/conflicto por scoring, o alta. */
function reconciliarRegistro(
  dao: CatalogDao,
  existentes: Map<string, Existente[]>,
  r: RawRecord,
  reescritura: Map<string, string>,
  conflictos: ConflictoDetalle[],
  opciones?: ReconciliarOpciones,
): EstadoRegistro {
  const slug = r.device.slug!
  // 1) Clave natural exacta (slug) → actualización directa.
  if (dao.deviceId(slug) !== undefined) {
    return { reconciliacion: { status: 'actualizacion', slug }, incluir: true }
  }
  // 2) Dedup por (fabricante, modelo) contra existentes con scoring (§19.2-4).
  const candidatos = candidatosDe(r.device, existentes)
  if (candidatos.length === 0) return { reconciliacion: { status: 'nuevo', slug }, incluir: true }
  return evaluarCandidato(r, candidatos, reescritura, conflictos, opciones)
}

/** Existentes del mismo fabricante y modelo, si el registro los trae. */
function candidatosDe(d: RawRecord['device'], existentes: Map<string, Existente[]>): Existente[] {
  const modelo = (d.model ?? d.name).trim().toLowerCase()
  return existentes.get(`${d.manufacturerSlug}|${modelo}`) ?? []
}

/** Mejor candidato por score. */
function mejorCandidato(d: RawRecord['device'], candidatos: readonly Existente[]): { e: Existente; score: number } | undefined {
  let mejor: { e: Existente; score: number } | undefined
  for (const e of candidatos) {
    const eval_ = dedupScore(
      { manufacturerSlug: d.manufacturerSlug, name: d.name, model: d.model, sku: d.sku, categoryCode: d.categoryCode },
      { manufacturerSlug: e.manufacturerSlug, name: e.name, model: e.model, sku: e.sku || undefined },
    )
    if (!mejor || eval_.score > mejor.score) mejor = { e, score: eval_.score }
  }
  return mejor
}

/** Decide fusión automática (≥0.98), candidato a revisión o alta. */
function evaluarCandidato(
  r: RawRecord,
  candidatos: readonly Existente[],
  reescritura: Map<string, string>,
  conflictos: ConflictoDetalle[],
  opciones?: ReconciliarOpciones,
): EstadoRegistro {
  const slug = r.device.slug!
  const mejor = mejorCandidato(r.device, candidatos)
  if (!mejor) return { reconciliacion: { status: 'nuevo', slug }, incluir: true }
  if (mejor.score >= 0.98) return fusionarAutomaticamente(slug, mejor, reescritura)
  if (mejor.score >= UMBRAL_CANDIDATO) return marcarRevision(r, mejor, conflictos, opciones)
  return { reconciliacion: { status: 'nuevo', slug }, incluir: true }
}

/** Fusión automática: los datos entrantes se persisten sobre el existente. */
function fusionarAutomaticamente(slug: string, mejor: { e: Existente; score: number }, reescritura: Map<string, string>): EstadoRegistro {
  reescritura.set(slug, mejor.e.slug)
  return {
    reconciliacion: { status: 'actualizacion', slug, detail: `fusión automática con ${mejor.e.slug} (score ${mejor.score})` },
    incluir: true,
  }
}

/** Candidato a revisión humana: se registra, se notifica y se excluye del lote. */
function marcarRevision(
  r: RawRecord,
  mejor: { e: Existente; score: number },
  conflictos: ConflictoDetalle[],
  opciones?: ReconciliarOpciones,
): EstadoRegistro {
  const conflicto = conflictoDe(r.device, mejor)
  conflictos.push(conflicto)
  opciones?.onConflicto?.(conflicto)
  return {
    reconciliacion: { status: 'conflicto', slug: r.device.slug!, detail: `candidato a revisión contra ${mejor.e.slug} (score ${mejor.score.toFixed(3)})` },
    incluir: false,
  }
}

/** Diferencias visibles del par entrante/existente para revisión humana (F6). */
function conflictoDe(d: RawRecord['device'], mejor: { e: Existente; score: number }): ConflictoDetalle {
  const modeloCambia = Boolean(d.model && mejor.e.model && d.model.trim().toLowerCase() !== mejor.e.model.trim().toLowerCase())
  return {
    entradaSlug: d.slug!,
    existenteSlug: mejor.e.slug,
    score: mejor.score,
    diff: [
      { campo: 'name', entrante: d.name, existente: mejor.e.name },
      ...(modeloCambia ? [{ campo: 'model', entrante: d.model!, existente: mejor.e.model }] : []),
    ],
  }
}