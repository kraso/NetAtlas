import {
  Device,
  Port,
  Manufacturer,
  Category,
  OsiProfileValue,
  Slug,
  requireLifecycleStatus,
  Relationship,
  Assertion,
  Source,
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
  GraphRepository,
  NeighborsQuery,
  Path,
  SourcingRepository,
  GraphNode,
  Relationship as RelationshipType,
} from '@netatlas/domain'
import type { Speed, Confidence } from '@netatlas/domain'

/**
 * Adaptadores in-memory de los puertos del dominio para la UI.
 *
 * F1 UI: la app corre en navegador/tests SIN SQLite WASM (wa-sqlite llega en
 * F1-late con el mismo contrato de puertos). Este adaptador permite verificar
 * dashboards, explorador, ficha y panel OSI de forma determinista.
 * Sustitución real: paquete @netatlas/data (Sqlite*) — mismo contrato.
 */

export interface InMemoryDataset {
  readonly devices: readonly Device[]
  readonly manufacturers: readonly Manufacturer[]
  readonly categories: readonly Category[]
  readonly relationships: readonly Relationship[]
  readonly assertions: readonly Assertion[]
  readonly sources: readonly Source[]
  readonly protocols?: readonly { code: string; name: string; family: string; osiLayer: number }[]
  readonly standards?: readonly { org: string; identifier: string; title: string }[]
  readonly media?: readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[]
  /** EAV demo (F3): definiciones de atributo por categoría. */
  readonly attributeDefinitions?: readonly InMemoryAttributeDefinition[]
  /** EAV demo (F3): valores por dispositivo. */
  readonly deviceAttributeValues?: readonly InMemoryDeviceAttributeValue[]
}

/** Contrato de atributos (EAV §9.4) para las vistas — sin acoplar a @netatlas/data. */
export interface UiAttributeDefinition {
  readonly key: string
  readonly labelEs: string
  readonly valueType: 'number' | 'text' | 'enum' | 'bool' | 'range'
  readonly unit?: string
  readonly enumValues?: readonly string[]
  readonly isFacet: boolean
  readonly isComparable: boolean
  readonly compareRule: 'higher-better' | 'lower-better' | 'set-compare' | 'none'
}

/** Valor EAV de un dispositivo (pestaña Capacidades). */
export interface UiDeviceAttributeValue {
  readonly key: string
  readonly labelEs: string
  readonly valueType: UiAttributeDefinition['valueType']
  readonly unit?: string
  readonly display: string
}

/** Conteo de una faceta dinámica (valor → cuántos dispositivos). */
export interface UiFacetCount {
  readonly value: string
  readonly count: number
}

export interface UiAttributesRepo {
  attributeDefinitionsByCategory(code: string): Promise<readonly UiAttributeDefinition[]>
  attributeValuesForDevice(slug: string): Promise<readonly UiDeviceAttributeValue[]>
  facetCounts(categoryCode: string, key: string): Promise<readonly UiFacetCount[]>
  filterByFacetValues(categoryCode: string, facets: Readonly<Record<string, readonly string[]>>): Promise<readonly string[]>
}

export interface InMemoryAttributeDefinition extends UiAttributeDefinition {
  readonly categoryCode: string
}

export interface InMemoryDeviceAttributeValue {
  readonly deviceSlug: string
  readonly key: string
  readonly display: string
}

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

// ── Grafo y sourcing in-memory ───────────────────────────────────────────────

export class InMemoryGraphRepository implements GraphRepository {
  constructor(private readonly data: InMemoryDataset) {}

  async edgesOf(node: GraphNode): Promise<readonly Relationship[]> {
    return this.data.relationships.filter(
      (r) =>
        (r.subject.type === node.type && r.subject.slug === node.slug) ||
        (r.object.type === node.type && r.object.slug === node.slug),
    )
  }

  async neighbors(query: NeighborsQuery): Promise<readonly Relationship[]> {
    // Vecindad directa (profundidad 1) para la ficha de la UI.
    const directas = await this.edgesOf(query.node)
    return directas.filter((r) => !query.predicates || query.predicates.includes(r.predicate))
  }

  async paths(_from: GraphNode, _to: GraphNode, _maxDepth: number): Promise<readonly Path[]> {
    return []
  }
}

export class InMemorySourcingRepository implements SourcingRepository {
  constructor(private readonly data: InMemoryDataset) {}

  /** Afirmaciones de un dispositivo por slug. */
  async assertionsForDevice(slug: string): Promise<readonly Assertion[]> {
    const i = this.data.devices.findIndex((d) => d.slug.value === slug)
    if (i === -1) return []
    return this.assertionsFor('device', i + 1)
  }

  async assertionsFor(subjectType: string, subjectId: number): Promise<readonly Assertion[]> {
    return this.data.assertions.filter(
      (a) => a.subjectType === subjectType && a.subjectId === subjectId,
    )
  }

  async sourceBySlug(slug: string): Promise<Source | undefined> {
    return this.data.sources.find((s) => s.slug === slug)
  }
}

/** Adaptador EAV in-memory (F3): facetas dinámicas y pestaña Capacidades. */
export class InMemoryAttributesRepository implements UiAttributesRepo {
  constructor(private readonly data: InMemoryDataset) {}

  async attributeDefinitionsByCategory(code: string): Promise<readonly UiAttributeDefinition[]> {
    const ancestros = this.ancestors(code)
    return (this.data.attributeDefinitions ?? []).filter((d) => ancestros.includes(d.categoryCode))
  }

  async attributeValuesForDevice(slug: string): Promise<readonly UiDeviceAttributeValue[]> {
    const defs = new Map((this.data.attributeDefinitions ?? []).map((d) => [d.key, d]))
    return (this.data.deviceAttributeValues ?? [])
      .filter((v) => v.deviceSlug === slug)
      .map((v) => {
        const def = defs.get(v.key)
        return {
          key: v.key,
          labelEs: def?.labelEs ?? v.key,
          valueType: def?.valueType ?? 'text',
          unit: def?.unit,
          display: v.display,
        }
      })
  }

  async facetCounts(categoryCode: string, key: string): Promise<readonly UiFacetCount[]> {
    const sub = this.subtree(categoryCode)
    const defs = await this.attributeDefinitionsByCategory(categoryCode)
    if (!defs.some((d) => d.key === key && d.isFacet)) return []
    const counts = new Map<string, number>()
    for (const v of this.data.deviceAttributeValues ?? []) {
      const dev = this.data.devices.find((d) => d.slug.value === v.deviceSlug)
      if (!dev || !sub.includes(dev.categoryCode)) continue
      if (v.key !== key || v.display === '—') continue
      counts.set(v.display, (counts.get(v.display) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  async filterByFacetValues(
    categoryCode: string,
    facets: Readonly<Record<string, readonly string[]>>,
  ): Promise<readonly string[]> {
    const sub = this.subtree(categoryCode)
    const keys = Object.keys(facets).filter((k) => (facets[k]?.length ?? 0) > 0)
    const porDispositivo = new Map<string, Map<string, Set<string>>>()
    const defs = new Map((this.data.attributeDefinitions ?? []).map((d) => [d.key, d]))
    for (const v of this.data.deviceAttributeValues ?? []) {
      const dev = this.data.devices.find((d) => d.slug.value === v.deviceSlug)
      if (!dev || !sub.includes(dev.categoryCode)) continue
      const def = defs.get(v.key)
      if (def && !def.isFacet) continue
      let grupo = porDispositivo.get(v.deviceSlug)
      if (!grupo) {
        grupo = new Map()
        porDispositivo.set(v.deviceSlug, grupo)
      }
      let vals = grupo.get(v.key)
      if (!vals) {
        vals = new Set()
        grupo.set(v.key, vals)
      }
      vals.add(v.display)
    }
    const cumple = (grupo: Map<string, Set<string>>): boolean =>
      keys.every((k) => {
        const candidatos = grupo.get(k)
        if (!candidatos || candidatos.size === 0) return false
        return [...candidatos].some((val) => facets[k]!.includes(val))
      })
    return [...porDispositivo.entries()]
      .filter(([, grupo]) => cumple(grupo))
      .map(([slug]) => slug)
      .sort()
  }

  /** Categoría y todos sus ancestros (para definiciones heredadas). */
  private ancestors(code: string): string[] {
    const out: string[] = []
    let current: string | undefined = code
    let guard = 0
    while (current !== undefined && guard++ < 32) {
      out.push(current)
      const cat = this.data.categories.find((c) => c.code === current)
      current = cat?.parentCode
    }
    return out
  }

  /** Categoría y todos sus descendientes (subárbol para facetas). */
  private subtree(code: string): string[] {
    const out = [code]
    const stack = [code]
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const c of this.data.categories) {
        if (c.parentCode === current) {
          out.push(c.code)
          stack.push(c.code)
        }
      }
    }
    return out
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
  const index = new Map(devices.map((d, i) => [d.slug.value, i]))

  // Relaciones de la ficha: fabricante, categoría, protocoL (soportes), historia, compatibilidad
  const relationships: Relationship[] = []
  let relId = 1
  const rel = (from: string, predicate: string, toType: string, toSlug: string): void => {
    relationships.push(
      Relationship.create({
        subject: { type: 'device', slug: from },
        predicate,
        object: { type: toType as GraphNode['type'], slug: toSlug },
        validFrom: '2020-01-01',
      }),
    )
    relId++
  }
  void relId
  for (const d of devices) {
    rel(d.slug.value, 'manufactured-by', 'manufacturer', d.manufacturerSlug)
    rel(d.slug.value, 'has-category', 'category', d.categoryCode)
  }
  // Sucesión (historia): 2930F sucede a 2960X (mismo rol), 6300M sucede a 2930F
  rel('aruba-6300m-48g', 'succeeds', 'device', 'aruba-2930f-48g')
  rel('aruba-2930f-48g', 'precedes', 'device', 'aruba-6300m-48g')
  rel('cisco-c9300-48p', 'replaced-by', 'device', 'cisco-9120axi')
  // Soportes de protocolo
  rel('cisco-c9300-48p', 'supports-protocol', 'protocol', 'ospf')
  rel('cisco-c9300-48p', 'supports-protocol', 'protocol', 'bgp')
  rel('cisco-c9300-48p', 'supports-protocol', 'protocol', 'vxlan')
  rel('aruba-6300m-48g', 'supports-protocol', 'protocol', 'ospf')
  rel('aruba-6300m-48g', 'supports-protocol', 'protocol', 'vxlan')
  rel('aruba-2930f-48g', 'supports-protocol', 'protocol', 'ospf')
  rel('mikrotik-ccr1036', 'supports-protocol', 'protocol', 'bgp')
  rel('mikrotik-ccr1036', 'supports-protocol', 'protocol', 'mpls')
  rel('fortinet-200f', 'supports-protocol', 'protocol', 'ipsec')
  rel('cisco-9120axi', 'supports-protocol', 'protocol', '802.11ax')
  // Estándares implementados
  rel('cisco-c9300-48p', 'implements-standard', 'standard', 'ieee/802.3at')
  rel('aruba-2930f-48g', 'implements-standard', 'standard', 'ieee/802.3at')
  // Medios terminados
  rel('mikrotik-ccr1036', 'terminates-medium', 'medium', 'smf-os2')
  rel('cisco-c9300-48p', 'terminates-medium', 'medium', 'utp-cat6a')

  // Fuentes y assertions (trazabilidad de la ficha)
  const sources = [
    Source.create({ slug: 'demo-datasheet', kind: 'datasheet', publisher: 'NetAtlas demo', title: 'Datasheet de demostración', authorityLevel: 1 }),
    Source.create({ slug: 'demo-editorial', kind: 'editorial', publisher: 'NetAtlas demo', title: 'Criterio de demostración', authorityLevel: 4 }),
  ]
  const assertId = (_unused: number): number => 1
  const makeAssertion = (
    slug: string,
    predicate: string,
    value: unknown,
    sourceSlug: string,
    confidence: Confidence,
  ): Assertion =>
    Assertion.create({
      subjectType: 'device',
      subjectId: index.get(slug)! + 1, // 1-based (indexOf del repositorio)
      predicate,
      valueJson: JSON.stringify(value),
      source: sources.find((s) => s.slug === sourceSlug)!,
      confidence,
      verifiedOn: '2025-02-10',
      author: 'curator-demo',
      reviewedBy: 'reviewer-demo',
    })
  const assertions = [
    makeAssertion('cisco-c9300-48p', 'throughput_gbps', 256, 'demo-datasheet', 'official'),
    makeAssertion('cisco-c9300-48p', 'power_consumption_w', 220, 'demo-datasheet', 'official'),
    makeAssertion('aruba-2930f-48g', 'throughput_gbps', 176, 'demo-datasheet', 'official'),
    makeAssertion('mikrotik-ccr1036', 'routing_throughput_mbps', 10000, 'demo-editorial', 'third-party'),
    makeAssertion('fortinet-200f', 'firewall_throughput_gbps', 18, 'demo-editorial', 'third-party'),
  ]
  // Enlaza assertions a los ids de subject del índice
  void assertId

  // Catálogos cerrados mínimos para los exploradores (NET-HW-023)
  const protocols = [
    { code: 'ospf', name: 'OSPF', family: 'routing', osiLayer: 3 },
    { code: 'bgp', name: 'BGP', family: 'routing', osiLayer: 3 },
    { code: 'vxlan', name: 'VXLAN', family: 'overlay', osiLayer: 2 },
    { code: 'mpls', name: 'MPLS', family: 'routing', osiLayer: 3 },
    { code: 'ipsec', name: 'IPsec', family: 'security', osiLayer: 3 },
    { code: '802.11ax', name: '802.11ax (Wi-Fi 6)', family: 'wifi', osiLayer: 1 },
  ]
  const standards = [
    { org: 'ieee', identifier: '802.3at', title: 'Power over Ethernet Plus' },
    { org: 'ieee', identifier: '802.3an', title: '10GBASE-T' },
  ]
  const media = [
    { code: 'smf-os2', kind: 'fibra', name: 'Monomodo OS2', maxSpeedMbps: 400000 },
    { code: 'utp-cat6a', kind: 'cobre', name: 'UTP Cat6A', maxSpeedMbps: 10000 },
    { code: 'mmf-om3', kind: 'fibra', name: 'Multimodo OM3', maxSpeedMbps: 10000 },
  ]

  // ── EAV demo (F3): definiciones de atributo y valores por dispositivo ──
  const atributo = (categoryCode: string, key: string, labelEs: string, valueType: UiAttributeDefinition['valueType'], isFacet: boolean, compareRule: UiAttributeDefinition['compareRule'], unit?: string, enumValues?: readonly string[]): InMemoryAttributeDefinition =>
    ({ categoryCode, key, labelEs, valueType, isFacet, isComparable: true, compareRule, unit, enumValues })
  const valor = (deviceSlug: string, key: string, display: string): InMemoryDeviceAttributeValue => ({ deviceSlug, key, display })

  const attributeDefinitions: readonly InMemoryAttributeDefinition[] = [
    atributo('CAT-SWT-L3', 'switching_capacity_gbps', 'Capacidad de conmutación', 'number', true, 'higher-better', 'Gbps'),
    atributo('CAT-SWT-L2', 'poe_budget_w', 'Presupuesto PoE', 'number', true, 'higher-better', 'W'),
    atributo('CAT-SWT-L2', 'stackable', 'Apilable', 'enum', true, 'set-compare', undefined, ['sí', 'no']),
    atributo('CAT-RTR', 'routing_throughput_mbps', 'Rendimiento de ruteo', 'number', true, 'higher-better', 'Mbps'),
    atributo('CAT-SEC', 'firewall_throughput_gbps', 'Rendimiento de firewall', 'number', true, 'higher-better', 'Gbps'),
    atributo('CAT-WLS', 'wifi_max_rate_mbps', 'Tasa máxima Wi-Fi', 'number', true, 'higher-better', 'Mbps'),
  ]
  const deviceAttributeValues: readonly InMemoryDeviceAttributeValue[] = [
    valor('cisco-c9300-48p', 'switching_capacity_gbps', '256'),
    valor('aruba-6300m-48g', 'switching_capacity_gbps', '176'),
    valor('aruba-2930f-48g', 'poe_budget_w', '370'),
    valor('aruba-2930f-48g', 'stackable', 'sí'),
    valor('mikrotik-ccr1036', 'routing_throughput_mbps', '10000'),
    valor('fortinet-200f', 'firewall_throughput_gbps', '18'),
    valor('cisco-9120axi', 'wifi_max_rate_mbps', '2400'),
  ]

  return { devices, manufacturers, categories, relationships, assertions, sources, protocols, standards, media, attributeDefinitions, deviceAttributeValues }
}

// Re-export de utilidad para viewmodels
export { Slug, requireLifecycleStatus, Relationship as RelationshipModel, Assertion as AssertionModel, Source as SourceModel }
export type { RelationshipType, Confidence }