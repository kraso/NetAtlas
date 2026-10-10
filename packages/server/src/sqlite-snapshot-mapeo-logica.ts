import type { SyncAssertion, SyncAttributeValue, SyncDatasheet, SyncDeviceRelation, SyncImage, SyncPort } from '@netatlas/domain'
import type {
  AfirmacionRow,
  DefinicionRow,
  FichaRow,
  ImagenRow,
  PuertoRow,
  RelacionRow,
  ValorRow,
} from './sqlite-snapshot-tipos.js'

/**
 * Lógica de mapeo de filas del snapshot al contrato de dominio.
 *
 * Extraída de `sqlite-snapshot-mapeo.ts` para mantener el módulo principal
 * por debajo del límite de 200 líneas (§Convenciones). Cada función agrupa
 * un único concern: puertos, relaciones, assertions, imágenes, fichas y
 * valores EAV.
 */

/** Agrupa puertos por `device_slug`. */
export function agruparPuertos(puertos: readonly PuertoRow[]): Map<string, SyncPort[]> {
  const porPuerto = new Map<string, SyncPort[]>()
  for (const p of puertos) {
    let speeds: number[] = []
    try {
      speeds = (JSON.parse(p.speeds_json ?? '[]') as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    } catch (error) {
      // Best-effort explícito: un puerto sin velocidades legibles se sirve sin ellas.
      console.warn(`[WARN] puerto ${p.label} de "${p.device_slug}": speeds_json ilegible`, { speedsJson: p.speeds_json, error })
      speeds = []
    }
    const lista = porPuerto.get(p.device_slug) ?? []
    lista.push({
      label: p.label,
      interfaceCode: p.interface_code,
      quantity: Number(p.quantity),
      speedsMbps: speeds,
      poeStandard: p.poe_standard ?? undefined,
      role: p.role ?? undefined,
      notes: p.notes ?? undefined,
    })
    porPuerto.set(p.device_slug, lista)
  }
  return porPuerto
}

/** Agrupa relaciones por `device_slug`. */
export function agruparRelaciones(relaciones: readonly RelacionRow[]): Map<string, SyncDeviceRelation[]> {
  const porRelacion = new Map<string, SyncDeviceRelation[]>()
  for (const r of relaciones) {
    const lista = porRelacion.get(r.device_slug) ?? []
    lista.push({
      predicate: r.predicate,
      objectType: r.object_type as SyncDeviceRelation['objectType'],
      objectCode: r.object_code,
    })
    porRelacion.set(r.device_slug, lista)
  }
  return porRelacion
}

/** Agrupa assertions por `subject_slug`. */
export function agruparAfirmaciones(afirmaciones: readonly AfirmacionRow[]): Map<string, SyncAssertion[]> {
  const porAfirmacion = new Map<string, SyncAssertion[]>()
  for (const a of afirmaciones) {
    const lista = porAfirmacion.get(a.subject_slug) ?? []
    lista.push({
      predicate: a.predicate,
      valueJson: a.value_json,
      sourceSlug: a.source_slug,
      confidence: a.confidence,
      verifiedOn: a.verified_on ?? '1970-01-01',
      author: a.author ?? 'desconocido',
      reviewedBy: a.reviewed_by ?? undefined,
      note: a.note ?? undefined,
    })
    porAfirmacion.set(a.subject_slug, lista)
  }
  return porAfirmacion
}

/** Agrupa imágenes por `device_slug`. */
export function agruparImagenes(imagenes: readonly ImagenRow[]): Map<string, SyncImage[]> {
  const porImagen = new Map<string, SyncImage[]>()
  for (const g of imagenes) {
    const lista = porImagen.get(g.device_slug) ?? []
    lista.push({
      kind: g.kind,
      caption: g.caption ?? undefined,
      localPath: g.local_path ?? undefined,
      url: g.url ?? undefined,
      sourceSlug: g.source_slug,
    })
    porImagen.set(g.device_slug, lista)
  }
  return porImagen
}

/** Agrupa fichas/datasheets por `device_slug`. */
export function agruparDatasheets(fichas: readonly FichaRow[]): Map<string, SyncDatasheet[]> {
  const porDatasheet = new Map<string, SyncDatasheet[]>()
  for (const f of fichas) {
    const lista = porDatasheet.get(f.device_slug) ?? []
    lista.push({
      title: f.title,
      language: f.language,
      url: f.url ?? undefined,
      localPath: f.local_path ?? undefined,
      sourceSlug: f.source_slug,
    })
    porDatasheet.set(f.device_slug, lista)
  }
  return porDatasheet
}

/** Agrupa valores EAV por `device_slug`. */
export function agruparValores(valores: readonly ValorRow[]): Map<string, SyncAttributeValue[]> {
  const porValor = new Map<string, SyncAttributeValue[]>()
  for (const v of valores) {
    const lista = porValor.get(v.device_slug) ?? []
    lista.push({
      deviceSlug: v.device_slug,
      key: v.key,
      display: mostrarValor(v.value_type, v.value_number, v.value_text, v.value_bool),
    })
    porValor.set(v.device_slug, lista)
  }
  return porValor
}

/**
 * Cadena legible de un valor EAV (misma regla que SqliteAttributesRepository:
 * number/range en crudo, bool como si/no, texto en crudo, '—' si ausente).
 */
export function mostrarValor(type: string, num: number | null, txt: string | null, bool: number | null): string {
  if (type === 'number' || type === 'range') {
    return num !== null ? String(Number(num)) : '—'
  }
  if (bool !== null) return Number(bool) === 1 ? 'sí' : 'no'
  if (txt !== null) return String(txt)
  return '—'
}

/** Parseo seguro de `enum_json` de una definición de atributo. */
export function parsearEnumJson(enumJson: string | null): string[] | undefined {
  if (!enumJson) return undefined
  try {
    return JSON.parse(enumJson) as string[]
  } catch (error) {
    // Best-effort explícito: una definición con enum ilegible se sirve sin enum.
    console.warn(`[WARN] enum_json ilegible en una definición de atributo`, { enumJson, error })
    return undefined
  }
}
