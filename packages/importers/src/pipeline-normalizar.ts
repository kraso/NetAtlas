import type { RawRecord } from './raw-record.js'

/**
 * ETAPA 2 del pipeline de importación (§19.2): normalización de slugs, fechas
 * ISO y fabricante canónico antes de validar.
 */

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