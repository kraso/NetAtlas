import {
  Device,
  Port,
  Manufacturer,
  Category,
  OsiProfileValue,
  Slug,
  requireLifecycleStatus,
} from '@netatlas/domain'
import type {
  DeviceRepository,
  CatalogRepository,
  DeviceQuery,
  Page,
  SearchIndex,
  SearchRequest,
  SearchResponse,
  SearchHit,
  SearchFacets,
  SuggestResult,
} from '@netatlas/domain'
import type { Speed } from '@netatlas/domain'

/**
 * Adaptadores in-memory de los puertos del dominio para la UI.
 *
 * F1 UI: la app corre en navegador/tests SIN SQLite WASM (wa-sqlite llega en
 * F1-late con el mismo contrato de puertos). Este adaptador permite verificar
 * dashboards, explorador, ficha y panel OSI de forma determinista.
 * Sustitución futura: wa-sqlite + SqliteDeviceRepository (packages/data)
 * — el resto de la app no cambia.
 */

export interface InMemoryDataset {
  readonly devices: readonly Device[]
  readonly manufacturers: readonly Manufacturer[]
  readonly categories: readonly Category[]
}

export class InMemoryDeviceRepository implements DeviceRepository {
  constructor(private readonly data: InMemoryDataset) {}

  async findBySlug(slug: string): Promise<Device | undefined> {
    return this.data.devices.find((d) => d.slug.value === slug)
  }

  async findByIds(ids: readonly number[]): Promise<readonly Device[]> {
    // Los ids in-memory no están estabilizados; se resuelve por sustitución
    // sobre el orden del dataset cuando se usa el comparador (F5).
    return ids.map((i) => this.data.devices[i]!).filter(Boolean)
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
}

/** Índice de búsqueda en memoria: texto libre + filtros por campo básicos. */
export class InMemorySearchIndex implements SearchIndex {
  constructor(private readonly data: InMemoryDataset) {}

  async query(request: SearchRequest): Promise<SearchResponse> {
    const q = request.rawQuery.trim().toLowerCase()
    const facetByCategory = (d: Device, f: Record<string, string[]> | undefined): boolean => {
      const cat = f?.category?.[0]
      if (!cat) return true
      const root = cat.split('-').slice(0, 2).join('-')
      return d.categoryCode.startsWith(root) || d.categoryCode === cat
    }
    const facetByLifecycle = (d: Device, f: Record<string, string[]> | undefined): boolean => {
      const lc = f?.lifecycleStatus?.[0]
      return !lc || d.lifecycleStatus === lc
    }
    const items = this.data.devices.filter((dev) => {
      if (q && !(dev.name.toLowerCase().includes(q) || dev.slug.value.includes(q) || (dev.model ?? '').toLowerCase().includes(q) || (dev.summary ?? '').toLowerCase().includes(q))) {
        return false
      }
      return facetByCategory(dev, request.facetFilters) && facetByLifecycle(dev, request.facetFilters)
    })

    const hits: SearchHit[] = items.slice(request.offset ?? 0, (request.offset ?? 0) + request.limit).map((dev) => ({
      entityType: 'device',
      slug: dev.slug.value,
      name: dev.name,
      score: 0,
    }))
    return { hits, total: items.length, facets: { category: [], lifecycleStatus: [], manufacturer: [] } }
  }

  async suggest(prefix: string, limit: number): Promise<readonly SuggestResult[]> {
    const p = prefix.toLowerCase()
    return this.data.devices
      .filter((d) => d.name.toLowerCase().includes(p) || d.slug.value.includes(p))
      .slice(0, limit)
      .map((d) => ({ entityType: 'device' as const, slug: d.slug.value, label: d.name }))
  }

  async byMaxSpeed(_minSpeed: Speed, request: SearchRequest): Promise<SearchResponse> {
    // F1 UI: la velocidad se filtra en el explorador por puertos; implementación
    // completa con el índice real en F1-late (wa-sqlite).
    return this.query(request)
  }
}

// ── Fábrica de dataset de demostración (determinista para tests/UI) ──────────

export function buildDemoDataset(): InMemoryDataset {
  const manufacturers = [
    Manufacturer.create({ slug: 'cisco', name: 'Cisco Systems', country: 'EE. UU.' }),
    Manufacturer.create({ slug: 'aruba', name: 'Aruba Networks', country: 'EE. UU.' }),
    Manufacturer.create({ slug: 'mikrotik', name: 'MikroTik', country: 'Letonia' }),
    Manufacturer.create({ slug: 'fortinet', name: 'Fortinet', country: 'EE. UU.' }),
  ]
  const categories = [
    Category.create({ code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['sw'], sortOrder: 1 }),
    Category.create({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'Switches capa 2', aliases: [], sortOrder: 11 }),
    Category.create({ code: 'CAT-SWT-L3', parentCode: 'CAT-SWT', nameEs: 'Switches multilayer', aliases: [], sortOrder: 12 }),
    Category.create({ code: 'CAT-RTR', nameEs: 'Routing', aliases: ['rtr'], sortOrder: 2 }),
    Category.create({ code: 'CAT-SEC', nameEs: 'Seguridad', aliases: ['fw'], sortOrder: 3 }),
    Category.create({ code: 'CAT-WLS', nameEs: 'Inalámbricos', aliases: ['wifi'], sortOrder: 4 }),
  ]

  const dev = (slug: string, name: string, mfr: string, cat: string, osi: [number[], number[], number]): Device =>
    Device.create({
      slug,
      name,
      manufacturerSlug: mfr,
      categoryCode: cat,
      lifecycleStatus: 'current',
      osiProfile: OsiProfileValue.create({ terminate: osi[0], transparent: osi[1], primary: osi[2] }),
      summary: `Dispositivo de demostración: ${name}.`,
      releasedOn: '2020-01-01',
      ports: [
        Port.create({ label: '48x 10/100/1000', interfaceCode: 'rj45', quantity: 48, speedsMbps: [1000], poeStandard: '802.3at', role: 'access' }),
        Port.create({ label: '4x SFP+', interfaceCode: 'sfp-plus', quantity: 4, speedsMbps: [10000], role: 'uplink' }),
      ],
    })

  const devices = [
    dev('cisco-c9300-48p', 'Cisco Catalyst 9300-48P', 'cisco', 'CAT-SWT-L3', [[1, 2, 3], [4, 5, 6, 7], 2]),
    dev('aruba-6300m-48g', 'Aruba 6300M 48G', 'aruba', 'CAT-SWT-L3', [[1, 2, 3], [4, 5, 6, 7], 2]),
    dev('aruba-2930f-48g', 'Aruba 2930F 48G PoE+', 'aruba', 'CAT-SWT-L2', [[1, 2], [3, 4, 5, 6, 7], 2]),
    dev('mikrotik-ccr1036', 'MikroTik CCR1036-8G-2S+', 'mikrotik', 'CAT-RTR', [[1, 2, 3, 4], [5, 6, 7], 3]),
    dev('fortinet-200f', 'FortiGate 200F', 'fortinet', 'CAT-SEC', [[1, 2, 3, 4, 5, 6, 7], [], 4]),
    dev('cisco-9120axi', 'Cisco Catalyst 9120AXI', 'cisco', 'CAT-WLS', [[1, 2], [3, 4, 5, 6, 7], 2]),
  ]

  return { devices, manufacturers, categories }
}

// Re-export de utilidad para viewmodels
export { Slug, requireLifecycleStatus }