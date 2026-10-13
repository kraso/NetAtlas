/**
 * Interfaz común que las vistas consumen.
 * Tanto los adaptadores in-memory (navegador/tests) como los repositorios
 * SQLite reales (packages/data + packages/search) la satisfacen: sustituir
 * el motor NO toca viewmodels ni vistas (hexagonal, §6).
 */
import type {
  Assertion,
  Category,
  Datasheet,
  Device,
  DeviceImage,
  DeviceQuery,
  Manufacturer,
  Page,
  Relationship,
  RespuestaIA,
  SearchHit,
  SearchResponse,
  SuggestResult,
} from '@netatlas/domain'
import type {
  InMemoryDataset,
  UiAttributesRepo,
  UiGraphSubgraph,
  UiQualityRepo,
  UiTopologyRepo,
} from './adapters/in-memory.js'

export interface UiDeviceRepo {
  findBySlug(slug: string): Promise<Device | undefined>
  listByCategory(categoryCode: string, query: DeviceQuery): Promise<Page<Device>>
  findByManufacturer(manufacturerSlug: string, query: DeviceQuery): Promise<Page<Device>>
  count(): Promise<number>
}

export interface UiCatalogRepo {
  listCategories(): Promise<readonly Category[]>
  listManufacturers(): Promise<readonly Manufacturer[]>
  manufacturerBySlug(slug: string): Promise<Manufacturer | undefined>
  categoryByCode(code: string): Promise<Category | undefined>
  /** Catálogos cerrados para exploradores bidireccionales (NET-HW-023). */
  listProtocols(): Promise<readonly { code: string; name: string; family: string; osiLayer: number }[]>
  listStandards(): Promise<readonly { org: string; identifier: string; title: string }[]>
  listMedia(): Promise<readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[]>
}

export interface UiSearchRepo {
  query(request: { rawQuery: string; limit: number; offset?: number; facetFilters?: Record<string, string[]> }): Promise<SearchResponse>
  suggest(prefix: string, limit: number): Promise<readonly SuggestResult[]>
  /** Autocompletado agrupado por tipo (NET-HW-014). */
  suggestGrouped(prefix: string, limitPerGroup: number): Promise<Readonly<Record<string, readonly { slug: string; label: string }[]>>>
}

export interface UiGraphRepo {
  edgesOf(node: { type: string; slug: string }): Promise<readonly Relationship[]>
  /** Subgrafo local multi-salto para el mapa (NET-HW-030). */
  vecindad(node: { type: string; slug: string }, maxDepth: number, predicates?: readonly string[]): Promise<UiGraphSubgraph>
  /** Predicados incidentes a un nodo (filtros del mapa). */
  predicadosDe(node: { type: string; slug: string }): Promise<readonly { code: string; count: number }[]>
  /** Mapa global con agregación por categoría (NET-HW-036). */
  mapaGlobal(): Promise<UiGraphSubgraph>
}

export interface UiSourcingRepo {
  assertionsForDevice(slug: string): Promise<readonly Assertion[]>
  /** Datasheets del dispositivo (pestaña Documentación, F2). */
  datasheetsForDevice(deviceSlug: string): Promise<readonly Datasheet[]>
  /** Imágenes del dispositivo (foto en Resumen, F2-Fotos). */
  imagesForDevice(deviceSlug: string): Promise<readonly DeviceImage[]>
}

/** Asistente IA (F7, §21): chat con citas obligatorias + flag ai.enabled. */
export interface UiAssistantRepo {
  ask(texto: string): Promise<RespuestaIA>
  /** Flag `ai.enabled` (off por defecto, §21.4). Persistido en localStorage. */
  enabled(): boolean
  setEnabled(on: boolean): void
}

export interface AppServices {
  readonly devices: UiDeviceRepo
  readonly catalog: UiCatalogRepo
  readonly search: UiSearchRepo
  readonly graph: UiGraphRepo
  readonly sourcing: UiSourcingRepo
  readonly attributes: UiAttributesRepo
  readonly topologies: UiTopologyRepo
  readonly quality: UiQualityRepo
  readonly asistente: UiAssistantRepo
  readonly dataset: InMemoryDataset
}

/** Topologías (F4 §13.3) y calidad/reconciliación (F6 §19.3 NET-HW-045/047/049). */
export type {
  Topology as UiTopology,
  TopologyNode as UiTopologyNode,
  TopologyEdge as UiTopologyEdge,
} from '@netatlas/domain'
export type {
  UiQualityReport,
  UiCoberturaCategoria,
  UiReconciliationRow,
  UiQualityRepo,
} from './adapters/in-memory.js'

/** Tipos y contrato EAV (§9.4), re-exportados para que las vistas no dependan del motor. */
export type {
  UiAttributeDefinition,
  UiDeviceAttributeValue,
  UiFacetCount,
  UiAttributesRepo,
  UiGraphNode,
  UiGraphEdge,
  UiGraphSubgraph,
  UiTopologyRepo,
} from './adapters/in-memory.js'
