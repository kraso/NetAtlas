import { create } from 'zustand'
import {
  InMemoryDeviceRepository,
  InMemoryCatalogRepository,
  InMemorySearchIndex,
  InMemoryGraphRepository,
  InMemorySourcingRepository,
  InMemoryAttributesRepository,
  InMemoryTopologyRepository,
  buildDemoDataset,
} from './adapters/in-memory.js'
import type { InMemoryDataset } from './adapters/in-memory.js'
import type {
  UiAttributeDefinition,
  UiDeviceAttributeValue,
  UiFacetCount,
  UiAttributesRepo,
  UiGraphNode,
  UiGraphEdge,
  UiGraphSubgraph,
  UiTopologyRepo,
} from './adapters/in-memory.js'
import type { Device, Category, Manufacturer, Assertion, Relationship, SearchResponse, SearchHit, SuggestResult } from '@netatlas/domain'
import type { Page, DeviceQuery } from '@netatlas/domain'

/**
 * Interfaz común que las vistas consumen.
 * Tanto los adaptadores in-memory (navegador/tests) como los repositorios
 * SQLite reales (packages/data + packages/search) la satisfacen: sustituir
 * el motor NO toca viewmodels ni vistas (hexagonal, §6).
 */
export interface UiDeviceRepo {
  findBySlug(slug: string): Promise<Device | undefined>
  listByCategory(categoryCode: string, query: DeviceQuery): Promise<Page<Device>>
  findByManufacturer(manufacturerSlug: string, query: DeviceQuery): Promise<Page<Device>>
  count(): Promise<number>
}

export interface UiCatalogRepo {
  listCategories(): Promise<readonly Category[]>
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

/** Contrato de topologías (F4 §13.3) — re-exportado del adaptador in-memory. */
export type { Topology as UiTopology, TopologyNode as UiTopologyNode, TopologyEdge as UiTopologyEdge } from '@netatlas/domain'

// Tipos y contrato EAV (§9.4): re-exportados del adaptador in-memory para que
// las vistas no dependan del motor de datos.
export type { UiAttributeDefinition, UiDeviceAttributeValue, UiFacetCount, UiAttributesRepo, UiGraphNode, UiGraphEdge, UiGraphSubgraph, UiTopologyRepo }

export interface UiSourcingRepo {
  assertionsForDevice(slug: string): Promise<readonly Assertion[]>
}

export interface AppServices {
  readonly devices: UiDeviceRepo
  readonly catalog: UiCatalogRepo
  readonly search: UiSearchRepo
  readonly graph: UiGraphRepo
  readonly sourcing: UiSourcingRepo
  readonly attributes: UiAttributesRepo
  readonly topologies: UiTopologyRepo
  readonly dataset: InMemoryDataset
}

export function buildServices(dataset?: InMemoryDataset): AppServices {
  const data = dataset ?? buildDemoDataset()
  return {
    devices: new InMemoryDeviceRepository(data),
    catalog: new InMemoryCatalogRepository(data),
    search: new InMemorySearchIndex(data),
    graph: new InMemoryGraphRepository(data),
    sourcing: new InMemorySourcingRepository(data),
    attributes: new InMemoryAttributesRepository(data),
    topologies: new InMemoryTopologyRepository(data),
    dataset: data,
  }
}

interface ServiceStore {
  services: AppServices
}

export const useServices = create<ServiceStore>(() => ({
  services: buildServices(),
}))

/** Permite a los tests inyectar un dataset controlado o el motor SQLite real. */
export function setServices(services: AppServices): void {
  useServices.setState({ services })
}