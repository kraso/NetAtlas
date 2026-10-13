import type { Device, Manufacturer, Category } from '@netatlas/domain'
import type {
  DeviceRepository,
  CatalogRepository,
  DeviceQuery,
  Page,
  SearchIndex,
  SearchRequest,
  SearchResponse,
  SearchHit,
  Speed,
  SuggestResult,
} from '@netatlas/domain'
import type { InMemoryDataset } from './in-memory-tipos.js'

export class InMemoryDeviceRepository implements DeviceRepository {
  constructor(private readonly data: InMemoryDataset) {}

  async findBySlug(slug: string): Promise<Device | undefined> {
    return this.data.devices.find((d) => d.slug.value === slug)
  }

  /** Posición del dispositivo en el dataset (id de sujeto para assertions in-memory). */
  indexOf(slug: string): number | undefined {
    const i = this.data.devices.findIndex((d) => d.slug.value === slug)
    return i === -1 ? undefined : i + 1
  }

  async findByIds(ids: readonly number[]): Promise<readonly Device[]> {
    // Los ids in-memory no están estabilizados; se resuelve por sustitución
    // sobre el orden del dataset cuando se usa el comparador (F5).
    return ids.map((i) => this.data.devices[i]).filter((d): d is Device => d !== undefined)
  }

  async listByCategory(categoryCode: string, query: DeviceQuery): Promise<Page<Device>> {
    const sub = new Set<string>(this.subcategories(categoryCode))
    const items = this.data.devices.filter(
      (d) => sub.has(d.categoryCode) && (query.lifecycleStatus ? d.lifecycleStatus === query.lifecycleStatus : true),
    )
    return { items: items.slice(0, query.limit) }
  }

  async findByManufacturer(manufacturerSlug: string, query: DeviceQuery): Promise<Page<Device>> {
    const items = this.data.devices.filter((d) => d.manufacturerSlug === manufacturerSlug)
    return { items: items.slice(0, query.limit) }
  }

  async count(): Promise<number> {
    return this.data.devices.length
  }

  async save(_device: Device): Promise<void> {
    // Los datos in-memory son de solo lectura en F1 UI (importación real en tools).
    throw new Error('save() no soportado en el adaptador in-memory de la UI.')
  }

  private subcategories(code: string): string[] {
    const direct = this.data.categories.filter((c) => c.code === code).map((c) => c.code)
    const children = this.data.categories.filter((c) => c.parentCode === code).flatMap((c) => this.subcategories(c.code))
    return [...direct, ...children]
  }
}

export class InMemoryCatalogRepository implements CatalogRepository {
  constructor(private readonly data: InMemoryDataset) {}

  async manufacturerBySlug(slug: string): Promise<Manufacturer | undefined> {
    return this.data.manufacturers.find((m) => m.slug.value === slug)
  }

  async categoryByCode(code: string): Promise<Category | undefined> {
    return this.data.categories.find((c) => c.code === code)
  }

  async listCategories(): Promise<readonly Category[]> {
    return this.data.categories
  }

  async listManufacturers(): Promise<readonly Manufacturer[]> {
    return this.data.manufacturers
  }

  async listProtocols(): Promise<readonly { code: string; name: string; family: string; osiLayer: number }[]> {
    return this.data.protocols ?? []
  }

  async listStandards(): Promise<readonly { org: string; identifier: string; title: string }[]> {
    return this.data.standards ?? []
  }

  async listMedia(): Promise<readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[]> {
    return this.data.media ?? []
  }
}

/** Índice de búsqueda en memoria: texto libre + filtros por campo básicos. */
export class InMemorySearchIndex implements SearchIndex {
  constructor(private readonly data: InMemoryDataset) {}

  async query(request: SearchRequest): Promise<SearchResponse> {
    const q = request.rawQuery.trim().toLowerCase()
    const items = this.data.devices.filter((dev) => {
      if (q && !this.coincideTexto(dev, q)) return false
      return this.facetByCategory(dev, request.facetFilters) && this.facetByLifecycle(dev, request.facetFilters)
    })

    const hits: SearchHit[] = items.slice(request.offset ?? 0, (request.offset ?? 0) + request.limit).map((dev) => ({
      entityType: 'device',
      slug: dev.slug.value,
      name: dev.name,
      score: 0,
    }))
    return { hits, total: items.length, facets: { category: [], lifecycleStatus: [], manufacturer: [] } }
  }

  private coincideTexto(dev: Device, q: string): boolean {
    return (
      dev.name.toLowerCase().includes(q) ||
      dev.slug.value.includes(q) ||
      (dev.model ?? '').toLowerCase().includes(q) ||
      (dev.summary ?? '').toLowerCase().includes(q)
    )
  }

  private facetByCategory(dev: Device, f: Record<string, string[]> | undefined): boolean {
    const cat = f?.category?.[0]
    if (!cat) return true
    const root = cat.split('-').slice(0, 2).join('-')
    return dev.categoryCode.startsWith(root) || dev.categoryCode === cat
  }

  private facetByLifecycle(dev: Device, f: Record<string, string[]> | undefined): boolean {
    const lc = f?.lifecycleStatus?.[0]
    return !lc || dev.lifecycleStatus === lc
  }

  async suggest(prefix: string, limit: number): Promise<readonly SuggestResult[]> {
    const p = prefix.toLowerCase()
    return this.data.devices
      .filter((d) => d.name.toLowerCase().includes(p) || d.slug.value.includes(p))
      .slice(0, limit)
      .map((d) => ({ entityType: 'device' as const, slug: d.slug.value, label: d.name }))
  }

  /** Autocompletado agrupado por tipo (dispositivos, categorías, protocolos, estándares, fabricantes). */
  async suggestGrouped(prefix: string, limitPerGroup: number): Promise<Readonly<Record<string, readonly { slug: string; label: string }[]>>> {
    const p = prefix.toLowerCase()
    const match = (s: string): boolean => s.toLowerCase().includes(p)
    const g = (items: readonly { slug: string; label: string }[]): readonly { slug: string; label: string }[] =>
      items.filter((i) => match(i.slug) || match(i.label)).slice(0, limitPerGroup)
    return {
      'Dispositivos': g(this.data.devices.map((d) => ({ slug: d.slug.value, label: d.name }))),
      'Categorías': g(this.data.categories.map((c) => ({ slug: c.code, label: c.nameEs }))),
      'Protocolos': g((this.data.protocols ?? []).map((pr) => ({ slug: pr.code, label: pr.name }))),
      'Estándares': g((this.data.standards ?? []).map((s) => ({ slug: `${s.org}/${s.identifier}`, label: s.title }))),
      'Fabricantes': g(this.data.manufacturers.map((m) => ({ slug: m.slug.value, label: m.name }))),
    }
  }

  async byMaxSpeed(_minSpeed: Speed, request: SearchRequest): Promise<SearchResponse> {
    return this.query(request)
  }
}
