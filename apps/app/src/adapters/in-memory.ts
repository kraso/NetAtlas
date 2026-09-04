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
  Datasheet,
  Source,
  Topology,
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
import { calcularCoberturaCritica, PASIVAS } from '@netatlas/domain'
import type { CoberturaCriticaResultado } from '@netatlas/domain'

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
  /** Topologías demo (F4 §13.3). */
  readonly topologies?: readonly Topology[]
  /** Datasheets por dispositivo (F2-Documentación). */
  readonly datasheets?: readonly Datasheet[]
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

/** Nodo del subgrafo local para el mapa (NET-HW-030). */
export interface UiGraphNode {
  readonly id: string
  readonly type: string
  readonly label: string
}

/** Arista del subgrafo local (dirección subject → object normalizada). */
export interface UiGraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly predicate: string
}

/** Subgrafo local de un nodo: nodos + aristas + predicados presentes. */
export interface UiGraphSubgraph {
  readonly nodes: readonly UiGraphNode[]
  readonly edges: readonly UiGraphEdge[]
  readonly predicates: readonly { code: string; count: number }[]
}

export interface UiAttributesRepo {
  attributeDefinitionsByCategory(code: string): Promise<readonly UiAttributeDefinition[]>
  attributeValuesForDevice(slug: string): Promise<readonly UiDeviceAttributeValue[]>
  facetCounts(categoryCode: string, key: string): Promise<readonly UiFacetCount[]>
  filterByFacetValues(categoryCode: string, facets: Readonly<Record<string, readonly string[]>>): Promise<readonly string[]>
}

/** Construye el subgrafo a partir de aristas normalizadas del dominio. */
export function buildSubgraph(relationships: readonly Relationship[]): UiGraphSubgraph {
  const nodes = new Map<string, UiGraphNode>()
  const edges: UiGraphEdge[] = []
  const predicados = new Map<string, number>()
  for (const r of relationships) {
    const sourceId = `${r.subject.type}:${r.subject.slug}`
    const targetId = `${r.object.type}:${r.object.slug}`
    if (!nodes.has(sourceId)) nodes.set(sourceId, { id: sourceId, type: r.subject.type, label: r.subject.slug })
    if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, type: r.object.type, label: r.object.slug })
    edges.push({
      id: `${sourceId}|${r.predicate}|${targetId}`,
      source: sourceId,
      target: targetId,
      predicate: r.predicate,
    })
    predicados.set(r.predicate, (predicados.get(r.predicate) ?? 0) + 1)
  }
  return {
    nodes: [...nodes.values()],
    edges,
    predicates: [...predicados.entries()].map(([code, count]) => ({ code, count })),
  }
}

export interface InMemoryAttributeDefinition extends UiAttributeDefinition {
  readonly categoryCode: string
}

export interface InMemoryDeviceAttributeValue {
  readonly deviceSlug: string
  readonly key: string
  readonly display: string
}

/** Contrato de topologías (F4 §13.3): visor + persistencia de layout + laboratorio. */
export interface UiTopologyRepo {
  list(): Promise<readonly Topology[]>
  bySlug(slug: string): Promise<Topology | undefined>
  upsert(topology: Topology): Promise<void>
  saveLayout(slug: string, positions: ReadonlyArray<{ nodeId: string; x: number; y: number }>): Promise<void>
  remove(slug: string): Promise<void>
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

  /** Vecindad a profundidad N (BFS local; NET-HW-030). */
  async vecindad(node: GraphNode, maxDepth: number, predicates?: readonly string[]): Promise<UiGraphSubgraph> {
    const visitado = new Set<string>(`${node.type}:${node.slug}`)
    const frontera: GraphNode[] = [node]
    const acumulado: Relationship[] = []
    for (let depth = 0; depth < maxDepth && frontera.length > 0; depth++) {
      const actual = [...frontera]
      frontera.length = 0
      for (const nodo of actual) {
        const aristas = await this.edgesOf(nodo)
        for (const arista of aristas) {
          if (predicates && !predicates.includes(arista.predicate)) continue
          acumulado.push(arista)
          const peer = arista.subject.type === nodo.type && arista.subject.slug === nodo.slug ? arista.object : arista.subject
          const key = `${peer.type}:${peer.slug}`
          if (visitado.has(key)) continue
          visitado.add(key)
          if (depth < maxDepth - 1) frontera.push(peer)
        }
      }
    }
    return buildSubgraph(dedupImpl(acumulado))
  }

  /** Predicados incidentes a un nodo (para los filtros del mapa). */
  async predicadosDe(node: GraphNode): Promise<readonly { code: string; count: number }[]> {
    const aristas = await this.edgesOf(node)
    const counts = new Map<string, number>()
    for (const r of aristas) counts.set(r.predicate, (counts.get(r.predicate) ?? 0) + 1)
    return [...counts.entries()].map(([code, count]) => ({ code, count }))
  }

  /** Mapa global agregado por categoría (NET-HW-036): nodos = categorías con conteo. */
  async mapaGlobal(): Promise<UiGraphSubgraph> {
    const catName = new Map(this.data.categories.map((c) => [c.code, c.nameEs]))
    const catDe = new Map(this.data.devices.map((d) => [d.slug.value, d.categoryCode]))
    const conteoCat = new Map<string, number>()
    for (const d of this.data.devices) conteoCat.set(d.categoryCode, (conteoCat.get(d.categoryCode) ?? 0) + 1)

    const nodes = [...conteoCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => ({
        id: `category:${code}`,
        type: 'category' as const,
        label: `${catName.get(code) ?? code} (${n})`,
      }))

    const entreCategorias = new Map<string, { a: string; b: string; n: number }>()
    for (const r of this.data.relationships) {
      if (r.subject.type !== 'device' || r.object.type !== 'device') continue
      const a = catDe.get(r.subject.slug)
      const b = catDe.get(r.object.slug)
      if (!a || !b || a === b) continue
      const [x, y] = a < b ? [a, b] : [b, a]
      const key = `${x}|${y}`
      const actual = entreCategorias.get(key) ?? { a: x, b: y, n: 0 }
      actual.n++
      entreCategorias.set(key, actual)
    }
    const edges = [...entreCategorias.values()].map(({ a, b, n }) => ({
      id: `category:${a}|category:${b}|n${n}`,
      source: `category:${a}`,
      target: `category:${b}`,
      predicate: `${n} enlace${n > 1 ? 's' : ''} entre categorías`,
    }))

    return { nodes, edges, predicates: [] }
  }
}

function dedupImpl(rels: readonly Relationship[]): Relationship[] {
  const unicos = new Map<string, Relationship>()
  for (const r of rels) {
    const k = `${r.subject.type}:${r.subject.slug}|${r.predicate}|${r.object.type}:${r.object.slug}`
    if (!unicos.has(k)) unicos.set(k, r)
  }
  return [...unicos.values()]
}

export class InMemorySourcingRepository implements SourcingRepository {
  constructor(private readonly data: InMemoryDataset) {}

  /** Afirmaciones de un dispositivo por slug. */
  async assertionsForDevice(slug: string): Promise<readonly Assertion[]> {
    const i = this.data.devices.findIndex((d) => d.slug.value === slug)
    if (i === -1) return []
    return this.assertionsFor('device', i + 1)
  }

  /** Slug del dispositivo dueno de una assertion (subjectId = índice+1). */
  private slugDeAssertion(a: Assertion): string | undefined {
    if (a.subjectType !== 'device') return undefined
    return this.data.devices[a.subjectId - 1]?.slug.value
  }

  async assertionsFor(subjectType: string, subjectId: number): Promise<readonly Assertion[]> {
    return this.data.assertions.filter(
      (a) => a.subjectType === subjectType && a.subjectId === subjectId,
    )
  }

  async sourceBySlug(slug: string): Promise<Source | undefined> {
    return this.data.sources.find((s) => s.slug === slug)
  }

  /** Datasheets de un dispositivo por slug (pestaña Documentación, F2). */
  async datasheetsForDevice(deviceSlug: string): Promise<readonly Datasheet[]> {
    return (this.data.datasheets ?? []).filter((f) => f.deviceSlug === deviceSlug)
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

// ── Topologías in-memory (F4 §13.3) ─────────────────────────────────────────
// Las topologías de referencia viven en el dataset; el layout se persiste como
// override por slug en localStorage (el visor abre igual tras recargar). Las
// topologías de usuario (laboratorio, NET-HW-034) se guardan enteras.

const K_TOPOLOGIAS_USUARIO = 'netatlas.topologies.user.v1'
const layoutKey = (slug: string): string => `netatlas.layout.${slug}`

function storageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento (SSR/tests sin jsdom): el layout se pierde, no falla.
  }
}

function storageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {
    // idem
  }
}

/** Reconstruye una Topology desde su representación JSON (la serialización de getters no es directa). */
function topologyFromJson(j: Record<string, unknown>): Topology {
  const nodes = (j.nodes as { entityType: string; entitySlug: string; x?: number; y?: number; layerHint?: number }[]).map((n) => ({
    entityType: n.entityType as 'device' | 'category',
    entitySlug: n.entitySlug,
    x: n.x,
    y: n.y,
    layerHint: n.layerHint,
  }))
  const edges = (j.edges as { from: string; to: string; linkKind?: string; mediumCode?: string; label?: string }[]).map((e) => ({
    from: e.from,
    to: e.to,
    linkKind: e.linkKind,
    mediumCode: e.mediumCode,
    label: e.label,
  }))
  return Topology.create({
    slug: String((j.slug as { value: string }).value ?? j.slug),
    name: String(j.name),
    kind: String(j.kind) as 'reference' | 'user',
    nodes,
    edges,
    metadata: (j.metadata ?? {}) as Record<string, unknown>,
  })
}

export class InMemoryTopologyRepository implements UiTopologyRepo {
  constructor(private readonly data: InMemoryDataset) {}

  async list(): Promise<readonly Topology[]> {
    const demo = (this.data.topologies ?? []).map((t) => this.conLayout(t))
    const usuario = this.leerUsuarias().map((t) => this.conLayout(t))
    return [...demo, ...usuario]
  }

  async bySlug(slug: string): Promise<Topology | undefined> {
    const demo = (this.data.topologies ?? []).find((t) => t.slug.value === slug)
    const usuario = this.leerUsuarias().find((t) => t.slug.value === slug)
    const base = demo ?? usuario
    return base ? this.conLayout(base) : undefined
  }

  async upsert(topology: Topology): Promise<void> {
    if (topology.kind === 'user') {
      const lista = this.leerUsuarias().filter((t) => t.slug.value !== topology.slug.value)
      lista.push(topology)
      storageSet(K_TOPOLOGIAS_USUARIO, JSON.stringify(lista))
    }
    // Las de referencia son de solo lectura; el layout se persiste por override.
  }

  async saveLayout(slug: string, positions: ReadonlyArray<{ nodeId: string; x: number; y: number }>): Promise<void> {
    const mapa: Record<string, { x: number; y: number }> = {}
    for (const p of positions) mapa[p.nodeId] = { x: p.x, y: p.y }
    storageSet(layoutKey(slug), JSON.stringify(mapa))
  }

  async remove(slug: string): Promise<void> {
    storageSet(K_TOPOLOGIAS_USUARIO, JSON.stringify(this.leerUsuarias().filter((t) => t.slug.value !== slug)))
    storageRemove(layoutKey(slug))
  }

  private leerUsuarias(): Topology[] {
    const raw = storageGet(K_TOPOLOGIAS_USUARIO)
    if (!raw) return []
    try {
      const lista = JSON.parse(raw) as Record<string, unknown>[]
      return lista.map(topologyFromJson).filter((t): t is Topology => t.kind === 'user')
    } catch {
      return []
    }
  }

  private conLayout(t: Topology): Topology {
    const raw = storageGet(layoutKey(t.slug.value))
    if (!raw) return t
    try {
      const mapa = JSON.parse(raw) as Record<string, { x: number; y: number }>
      return t.withLayout(
        Object.entries(mapa).map(([nodeId, v]) => ({ nodeId, x: v.x, y: v.y })),
      )
    } catch {
      return t
    }
  }
}

// ── Calidad del dataset y cola de reconciliación (F6 §19.3, NET-HW-045/047/049) ─

export interface UiCoberturaCategoria {
  readonly categoria: string
  readonly dispositivos: number
  readonly conAssertions: number
  readonly cobertura: number
}

export interface UiQualityReport {
  readonly dispositivos: number
  readonly conAssertions: number
  readonly coberturaFuentes: number
  readonly coberturaCritica: CoberturaCriticaResultado
  readonly distribucionConfianza: readonly { confianza: string; n: number }[]
  readonly atributosEAV: number
  readonly dispositivosSinEAV: number
  readonly relaciones: number
  readonly reconciliacionesPendientes: number
  readonly porCategoria: readonly UiCoberturaCategoria[]
}

export interface UiReconciliationRow {
  readonly id: number
  readonly entradaSlug: string
  readonly existenteSlug: string
  readonly score: number
  readonly diff: readonly { campo: string; entrante: string; existente: string }[]
  readonly status: 'pending' | 'accepted' | 'rejected'
  readonly author?: string | undefined
  readonly createdAt: string
  readonly resolvedAt?: string | undefined
}

export interface UiQualityRepo {
  report(): Promise<UiQualityReport>
  reconciliacionesPendientes(): Promise<readonly UiReconciliationRow[]>
  resolverReconciliacion(id: number, decision: 'accepted' | 'rejected', autor: string): Promise<void>
  /** Manifiesto del dataset (solo disponible en el modo SQLite real). */
  manifiesto(): Promise<Record<string, unknown> | undefined>
}

const K_RECONCILIACION = 'netatlas.reconciliation.v1'

/** Adaptador de calidad para la UI demo (cola persistida en localStorage). */
export class InMemoryQualityRepository implements UiQualityRepo {
  constructor(private readonly data: InMemoryDataset) {}

  async report(): Promise<UiQualityReport> {
    const dispositivos = this.data.devices.length
    const conAssertions = this.data.devices.filter((d) => this.tieneAssertion(d.slug.value)).length
    const atributosEAV = (this.data.deviceAttributeValues ?? []).length
    const dispositivosSinEAV = this.data.devices.filter((d) => !(this.data.deviceAttributeValues ?? []).some((v) => v.deviceSlug === d.slug.value)).length

    const confianza = new Map<string, number>()
    for (const a of this.data.assertions) confianza.set(a.confidence, (confianza.get(a.confidence) ?? 0) + 1)

    const porCat = new Map<string, { dispositivos: number; conAssertions: number }>()
    for (const d of this.data.devices) {
      const e = porCat.get(d.categoryCode) ?? { dispositivos: 0, conAssertions: 0 }
      e.dispositivos++
      if (this.tieneAssertion(d.slug.value)) e.conAssertions++
      porCat.set(d.categoryCode, e)
    }

    // Cobertura de datos críticos (F2): assertions y relaciones del demo con la
    // misma métrica pura del dominio que el SQLite real.
    const slugDeAssertion = (a: Assertion): string | undefined =>
      a.subjectType === 'device' ? this.data.devices[a.subjectId - 1]?.slug.value : undefined
    const coberturaCritica = calcularCoberturaCritica(
      this.data.devices
        .filter((d) => !PASIVAS.includes(d.categoryCode))
        .map((d) => ({
          slug: d.slug.value,
          categoryCode: d.categoryCode,
          assertionPredicates: this.data.assertions.filter((a) => slugDeAssertion(a) === d.slug.value).map((a) => a.predicate),
          relationshipPredicates: this.data.relationships.filter((r) => r.subject.slug === d.slug.value || r.object.slug === d.slug.value).map((r) => r.predicate),
        })),
    )

    return {
      dispositivos,
      conAssertions,
      coberturaFuentes: dispositivos > 0 ? Math.round((conAssertions / dispositivos) * 100) : 0,
      coberturaCritica,
      distribucionConfianza: [...confianza.entries()].map(([confianza, n]) => ({ confianza, n })).sort((a, b) => b.n - a.n),
      atributosEAV,
      dispositivosSinEAV,
      relaciones: this.data.relationships.length,
      reconciliacionesPendientes: (await this.reconciliacionesPendientes()).length,
      porCategoria: [...porCat.entries()].map(([categoria, e]) => ({
        categoria,
        dispositivos: e.dispositivos,
        conAssertions: e.conAssertions,
        cobertura: e.dispositivos > 0 ? Math.round((e.conAssertions / e.dispositivos) * 100) : 0,
      })),
    }
  }

  async reconciliacionesPendientes(): Promise<readonly UiReconciliationRow[]> {
    const raw = storageGet(K_RECONCILIACION)
    if (!raw) return []
    try {
      const lista = JSON.parse(raw) as UiReconciliationRow[]
      return lista.filter((r) => r.status === 'pending')
    } catch {
      return []
    }
  }

  async resolverReconciliacion(id: number, decision: 'accepted' | 'rejected', autor: string): Promise<void> {
    const raw = storageGet(K_RECONCILIACION)
    const lista = raw ? (JSON.parse(raw) as UiReconciliationRow[]) : []
    const idx = lista.findIndex((r) => r.id === id)
    if (idx === -1) return
    lista[idx] = { ...lista[idx]!, status: decision, author: autor, resolvedAt: new Date().toISOString() }
    storageSet(K_RECONCILIACION, JSON.stringify(lista))
  }

  /** Extensión demo (no forma parte del contrato): sembrar un candidato pendiente. */
  async crearCandidatoDemo(entradaSlug: string, existenteSlug: string, score: number, diff: UiReconciliationRow['diff']): Promise<void> {
    const raw = storageGet(K_RECONCILIACION)
    const lista = raw ? (JSON.parse(raw) as UiReconciliationRow[]) : []
    const id = lista.length > 0 ? Math.max(...lista.map((r) => r.id)) + 1 : 1
    lista.push({ id, entradaSlug, existenteSlug, score, diff, status: 'pending', createdAt: new Date().toISOString() })
    storageSet(K_RECONCILIACION, JSON.stringify(lista))
  }

  /** Las assertions del demo referencian el device por índice (subjectId). */
  private tieneAssertion(slug: string): boolean {
    const idx = this.data.devices.findIndex((d) => d.slug.value === slug) + 1
    return this.data.assertions.some((a) => a.subjectId === idx)
  }

  /** Modo demo: no hay manifiesto de dataset en disco. */
  async manifiesto(): Promise<Record<string, unknown> | undefined> {
    return undefined
  }
}

// ── Fábrica de dataset de demostración (determinista para tests/UI) ──────────

export function buildDemoDataset(): InMemoryDataset {
  const manufacturers = [
    Manufacturer.create({ slug: 'cisco', name: 'Cisco Systems', country: 'EE. UU.', snmpEnterprise: 9 }),
    Manufacturer.create({ slug: 'aruba', name: 'Aruba Networks', country: 'EE. UU.', snmpEnterprise: 14823 }),
    Manufacturer.create({ slug: 'mikrotik', name: 'MikroTik', country: 'Letonia', snmpEnterprise: 14988 }),
    Manufacturer.create({ slug: 'fortinet', name: 'Fortinet', country: 'EE. UU.', snmpEnterprise: 12356 }),
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
    // El 9300 de demostración NO ofrece PoE en los puertos (8.2.5): permite que el
    // comparador (CU-02/F5) muestre diferencias reales frente a 6300M/2930F.
    Device.create({
      slug: 'cisco-c9300-48p',
      name: 'Cisco Catalyst 9300-48P',
      manufacturerSlug: 'cisco',
      categoryCode: 'CAT-SWT-L3',
      lifecycleStatus: 'current',
      osiProfile: OsiProfileValue.create({ terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 }),
      summary: 'Dispositivo de demostración: Cisco Catalyst 9300-48P.',
      releasedOn: '2020-01-01',
      ports: [
        Port.create({ label: '48x 10/100/1000', interfaceCode: 'rj45', quantity: 48, speedsMbps: [1000], role: 'access' }),
        Port.create({ label: '4x SFP+', interfaceCode: 'sfp-plus', quantity: 4, speedsMbps: [10000], role: 'uplink' }),
      ],
    }),
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
  const rel = (from: string, predicate: string, toType: string, toSlug: string, fromType = 'device'): void => {
    relationships.push(
      Relationship.create({
        subject: { type: fromType as GraphNode['type'], slug: from },
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
  // Similares (NET-HW-032): el 6300M y el 9300 son competidores de acceso L3
  rel('aruba-6300m-48g', 'similar-to', 'device', 'cisco-c9300-48p')
  // Tecnologías transversales (NET-HW-031): evolución PoE usa-technology
  rel('poe-8023af', 'evolves-into', 'technology', 'poe-8023at', 'technology')
  rel('poe-8023at', 'evolves-into', 'technology', 'poe-8023bt', 'technology')
  rel('cisco-c9300-48p', 'uses-technology', 'technology', 'poe-8023at')
  rel('aruba-2930f-48g', 'uses-technology', 'technology', 'poe-8023at')
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
    // Datasheet de demostración: la assertion de arquitectura del 200F cita la
    // doc oficial de Fortinet (misma fuente que el seed SQLite).
    Source.create({ slug: 'demo-datasheet', kind: 'datasheet', publisher: 'Fortinet', title: 'FortiGate 200F Series Data Sheet + Hardware acceleration (FortiOS 7.6.2)', url: 'https://docs.fortinet.com/document/fortigate/7.6.2/hardware-acceleration/336140/fortigate-200f-and-201f-fast-path-architecture', authorityLevel: 1 }),
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
    makeAssertion(
      'fortinet-200f',
      'internal-architecture',
      {
        cpu: 'Intel Xeon D-1627 (8 núcleos @ 2.90 GHz)',
        soc: { family: 'SoC4', note: 'SoC4 integra CPU propia y CP9XLite que no se usan en este modelo' },
        contentProcessors: ['CP9', 'CP9'],
        networkProcessors: ['NP6XLite'],
        storage: { type: 'SSD', capacityGB: 480 },
        summary:
          'CPU x86 separada + dos procesadores de contenido CP9 + un procesador de red NP6XLite (SoC4); todo el tráfico entre interfaces de datos puede ser descargado por el NP6XLite.',
      },
      'demo-datasheet',
      'official',
    ),
    makeAssertion(
      'cisco-c9300-48p',
      'internal-architecture',
      {
        cpu: 'CPU multi-núcleo del plano de control Catalyst 9000',
        soc: { family: 'ASIC UADP 2.0', note: 'Plano de datos a wire-rate en el ASIC UADP 2.0 + StackWise' },
        networkProcessors: ['UADP 2.0 ASIC'],
        summary: 'Arquitectura Catalyst 9000: ASIC UADP 2.0 para el reenvío a wire-rate y CPU multinúcleo para el plano de control y gestión.',
      },
      'demo-datasheet',
      'official',
    ),
    makeAssertion(
      'aruba-2930f-48g',
      'internal-architecture',
      {
        cpu: 'CPU de gestión de la plataforma ArubaOS-Switch',
        soc: { family: 'SoC de conmutación Aruba 2930F', note: 'Plano de datos a wire-rate en el switch SoC' },
        summary: 'Switch de acceso ArubaOS-Switch: plano de datos a wire-rate en el SoC de conmutación y CPU de gestión para el plano de control L2/L3-Lite.',
      },
      'demo-datasheet',
      'official',
    ),
    makeAssertion(
      'aruba-6300m-48g',
      'internal-architecture',
      {
        cpu: 'CPU de gestión de la plataforma ArubaOS-CX',
        soc: { family: 'SoC de conmutación Aruba 6300 (ASIC + CPU)', note: 'Uplinks SFP56 50G y stacking VSF' },
        summary: 'Switch de acceso/apilado ArubaOS-CX: plano de datos a wire-rate en el ASIC con uplinks 50G y CPU de gestión para el plano de control L2/L3.',
      },
      'demo-datasheet',
      'official',
    ),
    makeAssertion(
      'mikrotik-ccr1036',
      'internal-architecture',
      {
        cpu: '36 núcleos (Tillera/TILE-Gx) @ 1.2 GHz',
        ram: '8 GB',
        storage: { type: 'Flash', capacityGB: 0.512 },
        soc: { family: 'Tile-Gx (36 núcleos)', note: 'CCR1036 usa el procesador many-core TILE-Gx36' },
        summary: 'Router many-core: el TILE-Gx36 con 36 núcleos reparte el procesamiento de paquetes (RouterOS) a alta velocidad; 8 GB de RAM y flash de 512 MB.',
      },
      'demo-editorial',
      'third-party',
    ),
    makeAssertion(
      'cisco-9120axi',
      'internal-architecture',
      {
        cpu: 'CPU de plataforma Wi-Fi 6 (ARM)',
        soc: { family: 'SoC Wi-Fi 6 (802.11ax) 4x4:4', note: 'AP Catalyst 9120 con radio Wi-Fi 6 4x4:4 y 8 radios de escaneo' },
        summary: 'Punto de acceso Wi-Fi 6 4x4:4: el SoC integra las radios 802.11ax (2.4/5 GHz) y los servicios (RLDP, CleanAir); la electrónica concreta no se publica.',
      },
      'demo-datasheet',
      'official',
    ),
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

  // ── Topologías demo (F4 §13.3) ──────────────────────────────────────────
  const topologies: Topology[] = [
    Topology.create({
      slug: 'clos-demo',
      name: 'Clos de demostración (L3)',
      kind: 'reference',
      nodes: [
        { entityType: 'device', entitySlug: 'mikrotik-ccr1036', x: 0, y: 120, layerHint: 3 },
        { entityType: 'device', entitySlug: 'cisco-c9300-48p', x: 100, y: 0, layerHint: 3 },
        { entityType: 'device', entitySlug: 'aruba-6300m-48g', x: 260, y: 0, layerHint: 3 },
        { entityType: 'device', entitySlug: 'fortinet-200f', x: 180, y: 120, layerHint: 4 },
        { entityType: 'device', entitySlug: 'aruba-2930f-48g', x: 360, y: 120, layerHint: 2 },
        { entityType: 'device', entitySlug: 'cisco-9120axi', x: 480, y: 120, layerHint: 1 },
      ],
      edges: [
        { from: 'device:mikrotik-ccr1036', to: 'device:cisco-c9300-48p', label: '1G' },
        { from: 'device:mikrotik-ccr1036', to: 'device:aruba-6300m-48g', label: '10G' },
        { from: 'device:cisco-c9300-48p', to: 'device:aruba-6300m-48g', label: '40G spine' },
        { from: 'device:cisco-c9300-48p', to: 'device:fortinet-200f', label: '10G' },
        { from: 'device:aruba-6300m-48g', to: 'device:aruba-2930f-48g', label: '1G' },
        { from: 'device:aruba-2930f-48g', to: 'device:cisco-9120axi', label: 'PoE+' },
      ],
    }),
    Topology.create({
      slug: 'sucursal-demo',
      name: 'Sucursal de demostración',
      kind: 'reference',
      nodes: [
        { entityType: 'device', entitySlug: 'mikrotik-ccr1036', x: 0, y: 0, layerHint: 3 },
        { entityType: 'device', entitySlug: 'aruba-2930f-48g', x: 200, y: 0, layerHint: 2 },
        { entityType: 'device', entitySlug: 'cisco-9120axi', x: 400, y: 0, layerHint: 1 },
        { entityType: 'category', entitySlug: 'CAT-WLS', x: 400, y: 120, layerHint: 1 },
      ],
      edges: [
        { from: 'device:mikrotik-ccr1036', to: 'device:aruba-2930f-48g', label: '1G' },
        { from: 'device:aruba-2930f-48g', to: 'device:cisco-9120axi', label: 'PoE+' },
        { from: 'device:cisco-9120axi', to: 'category:CAT-WLS', label: 'categoría' },
      ],
    }),
  ]
  // Topología de 300 nodos (solo para el SLO de diagramas §23.2 en E2E)
  {
    const nodos: { entityType: 'device'; entitySlug: string; x: number; y: number }[] = []
    const edges: { from: string; to: string }[] = []
    for (let i = 1; i <= 300; i++) {
      nodos.push({
        entityType: 'device',
        entitySlug: `virt-${String(i).padStart(4, '0')}`,
        x: ((i - 1) % 20) * 60,
        y: Math.floor((i - 1) / 20) * 60,
      })
      if (i > 1) edges.push({ from: `device:virt-${String(i - 1).padStart(4, '0')}`, to: `device:virt-${String(i).padStart(4, '0')}` })
    }
    for (let i = 21; i <= 300; i += 25) edges.push({ from: 'device:virt-0001', to: `device:virt-${String(i).padStart(4, '0')}` })
    topologies.push(
      Topology.create({
        slug: 'estres-300',
        name: 'Estrés — 300 nodos (SLO de diagramas)',
        kind: 'reference',
        nodes: nodos,
        edges,
      }),
    )
  }

  // Datasheets demo (F2-Documentación): reutilizan la fuente demo-datasheet.
  const fuenteDemo = sources.find((s) => s.slug === 'demo-datasheet')!
  const datasheets = [
    Datasheet.create({
      deviceSlug: 'fortinet-200f',
      title: 'FortiGate 200F Series Data Sheet',
      language: 'en',
      url: 'https://docs.fortinet.com/document/fortigate/7.6.2/hardware-acceleration/336140/fortigate-200f-and-201f-fast-path-architecture',
      source: fuenteDemo,
    }),
    Datasheet.create({
      deviceSlug: 'cisco-c9300-48p',
      title: 'Cisco Catalyst 9300 Series — Hoja de datos',
      language: 'es',
      source: fuenteDemo,
    }),
  ]

  return { devices, manufacturers, categories, relationships, assertions, sources, protocols, standards, media, attributeDefinitions, deviceAttributeValues, topologies, datasheets }
}

// ── Asistente IA demo (F7 §21): ToolContext sobre el dataset de demostración ─

/**
 * Implementa el contrato UiAssistantRepo sobre el demo: el mismo cliente IA
 * del dominio (crearClienteIA) con un ToolContext que lee el dataset
 * in-memory. El flag `ai.enabled` es off por defecto (§21.4) y se persiste.
 */
import { crearClienteIA } from '@netatlas/domain'
import type { ToolContext, RespuestaIA } from '@netatlas/domain'

const K_AI_ENABLED = 'netatlas.ai.enabled'

class ToolContextDemo implements ToolContext {
  constructor(private readonly data: InMemoryDataset) {}

  async searchCatalog(dsl: string, limit: number): Promise<{ slug: string; nombre: string; categoria: string }[]> {
    const q = dsl.trim().toLowerCase()
    const devs = this.data.devices.filter(
      (d) => q.length === 0 || d.name.toLowerCase().includes(q) || d.slug.value.includes(q) || d.categoryCode.toLowerCase().includes(q),
    )
    const catName = new Map(this.data.categories.map((c) => [c.code, c.nameEs]))
    return devs.slice(0, limit).map((d) => ({ slug: d.slug.value, nombre: d.name, categoria: catName.get(d.categoryCode) ?? d.categoryCode }))
  }

  async getDevice(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const d = this.data.devices.find((x) => x.slug.value === slug || x.slug.value === slug.replace('-c9300-', '-c9300-'))
    if (!d) {
      // Aliases del demo: el nombre comercial puede diferir del slug.
      const porNombre = this.data.devices.find((x) => x.name.toLowerCase().includes(slug.toLowerCase().replace('-', ' ')))
      if (!porNombre) return undefined
      return this.ficha(porNombre)
    }
    return this.ficha(d)
  }

  private ficha(d: Device): Readonly<Record<string, unknown>> {
    const idx = this.data.devices.findIndex((x) => x.slug.value === d.slug.value) + 1
    const assertions = this.data.assertions
      .filter((a) => a.subjectId === idx)
      .map((a) => ({ predicado: a.predicate, valor: valorJsonLegible(a.valueJson), fuenteSlug: a.source.slug, fuenteTitulo: a.source.title }))
    const catName = this.data.categories.find((c) => c.code === d.categoryCode)?.nameEs ?? d.categoryCode
    const mfr = this.data.manufacturers.find((m) => m.slug.value === d.manufacturerSlug)?.name ?? d.manufacturerSlug
    const totalPorts = d.ports.reduce((acc, p) => acc + p.quantity, 0)
    return {
      slug: d.slug.value,
      nombre: d.name,
      fabricante: mfr,
      categoria: catName,
      lanza: d.releasedOn?.slice(0, 4),
      puertos: d.ports.map((p) => ({ label: p.label, cantidad: p.quantity, speeds: p.speedsMbps })),
      assertions,
      totalPuertos: totalPorts,
    }
  }

  async compareDevices(ids: string[]): Promise<Readonly<Record<string, unknown>>> {
    const filas: { clave: string; labelEs: string; valores: Record<string, string> }[] = []
    const dispositivos: { slug: string; nombre: string }[] = []
    const valores = (this.data.deviceAttributeValues ?? []).filter((v) => ids.includes(v.deviceSlug))
    const defs = new Map((this.data.attributeDefinitions ?? []).map((d) => [d.key, d]))
    const claves = new Set(valores.map((v) => v.key))
    for (const clave of claves) {
      const cell: Record<string, string> = {}
      for (const id of ids) {
        const v = valores.find((x) => x.deviceSlug === id && x.key === clave)
        cell[id] = v?.display ?? '—'
      }
      filas.push({ clave, labelEs: defs.get(clave)?.labelEs ?? clave, valores: cell })
    }
    for (const id of ids) {
      const d = this.data.devices.find((x) => x.slug.value === id)
      if (d) dispositivos.push({ slug: id, nombre: d.name })
    }
    return { dispositivos, diferencias: filas }
  }

  async findCompatible(device: string, _constraint: string | undefined): Promise<Readonly<Record<string, unknown>>> {
    const aristas = this.data.relationships.filter(
      (r) =>
        (r.predicate === 'similar-to' || r.predicate === 'compatible-with') &&
        ((r.subject.type === 'device' && r.subject.slug === device) || (r.object.type === 'device' && r.object.slug === device)),
    )
    const compatibles: { slug: string; nombre: string; via: string }[] = []
    for (const r of aristas) {
      const peer = r.subject.type === 'device' && r.subject.slug === device ? r.object : r.subject
      if (peer.type !== 'device') continue
      const d = this.data.devices.find((x) => x.slug.value === peer.slug)
      if (d) compatibles.push({ slug: peer.slug, nombre: d.name, via: r.predicate })
    }
    return { dispositivo: device, compatibles }
  }

  async buildTopology(spec: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    // Demo simplificado: usa la primera topología de referencia si no hay roles.
    const nombre = String(spec.name ?? 'Topología IA')
    const demo = this.data.topologies?.find((t) => t.slug.value === 'clos-demo')
    if (!demo) return { error: 'No hay topología demo disponible.' }
    return { slug: demo.slug.value, nombre: demo.name, nodos: demo.nodes.length, enlaces: demo.edges.length }
  }

  async whatLayers(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const d = this.data.devices.find((x) => x.slug.value === slug)
    if (!d || !d.osiProfile) return undefined
    return { slug, nombre: d.name, termina: d.osiProfile.profile.terminate, transparente: d.osiProfile.profile.transparent }
  }

  async successors(slug: string): Promise<{ relacion: string; slug: string; nombre: string }[]> {
    const aristas = this.data.relationships.filter((r) => r.subject.type === 'device' && r.subject.slug === slug && ['replaced-by', 'succeeds', 'precedes'].includes(r.predicate))
    return aristas.flatMap((r) => {
      if (r.object.type !== 'device') return []
      const d = this.data.devices.find((x) => x.slug.value === r.object.slug)
      return d ? [{ relacion: r.predicate, slug: d.slug.value, nombre: d.name }] : []
    })
  }
}

function valorJsonLegible(valueJson: string): string {
  try {
    const v = JSON.parse(valueJson) as unknown
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'sí' : 'no'
    if (typeof v === 'string') return v
    return String(v)
  } catch {
    return valueJson
  }
}

/** Repositorio de asistente demo: cliente IA + flag persistido (off por defecto). */
export class UiAssistantRepoDemo implements UiAssistantRepoLike {
  private readonly port: { ask(p: { texto: string }): Promise<RespuestaIA> }

  constructor(data: InMemoryDataset) {
    this.port = crearClienteIA(new ToolContextDemo(data)) as { ask(p: { texto: string }): Promise<RespuestaIA> }
  }

  async ask(texto: string): Promise<RespuestaIA> {
    return this.port.ask({ texto })
  }

  enabled(): boolean {
    try {
      return localStorage.getItem(K_AI_ENABLED) === 'on'
    } catch {
      return false
    }
  }

  setEnabled(on: boolean): void {
    try {
      if (on) localStorage.setItem(K_AI_ENABLED, 'on')
      else localStorage.removeItem(K_AI_ENABLED)
    } catch {
      // Sin almacenamiento: el flag no persiste pero no falla.
    }
  }
}

/** Tipo estructural del contrato UiAssistantRepo (evita import cíclico). */
export interface UiAssistantRepoLike {
  ask(texto: string): Promise<RespuestaIA>
  enabled(): boolean
  setEnabled(on: boolean): void
}

// Re-export de utilidad para viewmodels
export { Slug, requireLifecycleStatus, Relationship as RelationshipModel, Assertion as AssertionModel, Source as SourceModel }
export type { RelationshipType, Confidence }