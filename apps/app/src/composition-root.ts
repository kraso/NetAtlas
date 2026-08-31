import { create } from 'zustand'
import {
  InMemoryDeviceRepository,
  InMemoryCatalogRepository,
  InMemorySearchIndex,
  InMemoryGraphRepository,
  InMemorySourcingRepository,
  buildDemoDataset,
} from './adapters/in-memory.js'
import type { InMemoryDataset } from './adapters/in-memory.js'
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
}

export interface UiSourcingRepo {
  assertionsForDevice(slug: string): Promise<readonly Assertion[]>
}

export interface AppServices {
  readonly devices: UiDeviceRepo
  readonly catalog: UiCatalogRepo
  readonly search: UiSearchRepo
  readonly graph: UiGraphRepo
  readonly sourcing: UiSourcingRepo
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