/**
 * Caso de uso: Autocompletado agrupado (NET-HW-014).
 *
 * Orquesta `SearchPort.suggest` + `CatalogPort` para producir sugerencias
 * agrupadas por tipo (Dispositivos, Categorías, Protocolos, Estándares,
 * Fabricantes). Lógica pura y reutilizable por PWA, Tauri y servidor (F8B).
 */
import type { SearchPort, CatalogPort } from '../index.js'

export interface SuggestGroupedInput {
  readonly prefix: string
  readonly limitPerGroup: number
}

export type SuggestGroupedResult = Readonly<Record<string, readonly { slug: string; label: string }[]>>

const match = (prefix: string) =>
  (s: string): boolean => s.toLowerCase().includes(prefix.toLowerCase())

const slice = (limit: number) => <T,>(list: readonly T[]): readonly T[] => list.slice(0, limit)

function toRows<T extends { slug?: string; code?: string; name?: string; label?: string; nameEs?: string }>(
  items: readonly T[],
  slugFn: (i: T) => string,
  labelFn: (i: T) => string,
  prefix: string,
  limit: number,
): readonly { slug: string; label: string }[] {
  const m = match(prefix)
  return slice(limit)(
    items.map((i) => ({ slug: slugFn(i), label: labelFn(i) })).filter((r) => m(r.slug) || m(r.label)),
  )
}

/**
 * Construye el autocompletado agrupado. Delega dispositivos al puerto
 * SearchIndex.suggest (FTS) y recupera categorías, protocolos, estándares y
 * fabricantes desde el catálogo cerrado.
 */
export async function suggestGrouped(
  ports: { search: SearchPort; catalog: CatalogPort },
  input: SuggestGroupedInput,
): Promise<SuggestGroupedResult> {
  const { prefix, limitPerGroup } = input

  const [devices, categories, protocols, standards, media] = await Promise.all([
    ports.search.suggest(prefix, limitPerGroup),
    ports.catalog.listCategories(),
    ports.catalog.listProtocols(),
    ports.catalog.listStandards(),
    ports.catalog.listMedia(),
  ])

  const fabricantes = await ports.catalog.listManufacturers()

  return {
    Dispositivos: devices.map((d) => ({ slug: d.slug, label: d.label })),
    Categorías: toRows(categories, (c) => c.code, (c) => c.nameEs, prefix, limitPerGroup),
    Protocolos: toRows(protocols, (p) => p.code, (p) => p.name, prefix, limitPerGroup),
    Estándares: toRows(standards, (s) => s.slug, (s) => s.label, prefix, limitPerGroup),
    Medios: toRows(media, (m) => m.slug, (m) => m.label, prefix, limitPerGroup),
    Fabricantes: fabricantes
      .filter((m) => m.name.toLowerCase().includes(prefix.toLowerCase()))
      .slice(0, limitPerGroup)
      .map((m) => ({ slug: m.slug.value, label: m.name })),
  }
}
