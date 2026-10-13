import type { RawRecord } from './raw-record.js'
import type { DedupKey } from './pipeline-tipos.js'

/**
 * ETAPA 4 del pipeline de importación (§19.2): agrupación por clave natural
 * (fabricante + modelo) para detectar duplicados dentro del lote.
 */

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