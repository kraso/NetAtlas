import { create } from 'zustand'
import {
  InMemoryDeviceRepository,
  InMemoryCatalogRepository,
  InMemorySearchIndex,
  InMemoryGraphRepository,
  InMemorySourcingRepository,
  InMemoryAttributesRepository,
  InMemoryTopologyRepository,
  InMemoryQualityRepository,
  buildDemoDataset,
  UiAssistantRepoDemo,
} from './adapters/in-memory.js'
import { HttpUiRepos } from './adapters/http-ui.js'
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
  UiQualityRepo,
} from './adapters/in-memory.js'
import type { Device, Category, Manufacturer, Assertion, Relationship, SearchResponse, SearchHit, SuggestResult, RespuestaIA } from '@netatlas/domain'
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

/** Contrato de topologías (F4 §13.3) — re-exportado del adaptador in-memory. */
export type { Topology as UiTopology, TopologyNode as UiTopologyNode, TopologyEdge as UiTopologyEdge } from '@netatlas/domain'

// Calidad y reconciliación (F6 §19.3 / NET-HW-045/047/049)
export type { UiQualityReport, UiCoberturaCategoria, UiReconciliationRow, UiQualityRepo } from './adapters/in-memory.js'

// Tipos y contrato EAV (§9.4): re-exportados del adaptador in-memory para que
// las vistas no dependan del motor de datos.
export type { UiAttributeDefinition, UiDeviceAttributeValue, UiFacetCount, UiAttributesRepo, UiGraphNode, UiGraphEdge, UiGraphSubgraph, UiTopologyRepo }

export interface UiSourcingRepo {
  assertionsForDevice(slug: string): Promise<readonly Assertion[]>
  /** Datasheets del dispositivo (pestaña Documentación, F2). */
  datasheetsForDevice(deviceSlug: string): Promise<readonly import('@netatlas/domain').Datasheet[]>
  /** Imágenes del dispositivo (foto en Resumen, F2-Fotos). */
  imagesForDevice(deviceSlug: string): Promise<readonly import('@netatlas/domain').DeviceImage[]>
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

/**
 * Resuelve los servicios de la app según el entorno (hexagonal §6):
 * - Browser/PWA (F1): dataset demo en memoria (offline, 0 dependencias Node).
 * - Desktop (Electron/Tauri, F1-late): dataset real vía SQLite (wa-sqlite o node:sqlite).
 *
 * El flag `VITE_DATASET=sqlite` activa el backend real; por defecto se usa memoria.
 */
export function resolveServices(): AppServices {
  if (typeof import.meta !== 'undefined' && (import.meta.env as Record<string, unknown>).VITE_DATASET === 'sqlite') {
    // Lazy require: node:sqlite no existe en browser, por lo que el import
    // de composition-root-sqlite sólo se evalúa en entornos con Node runtime.
    // En desktop se resuelve a node:sqlite; en PWA el flag no se activa jamás.
    // Dynamic import para que Vite no bundle @netatlas/data en browser (F1-baseline).
    void import('./composition-root-sqlite.js').then((mod) => mod.buildSqliteServices())
    return buildServices()
  }
  return buildServices()
}

/** Adaptador HTTP API server (F8B): warmeza un pull a /api/snapshot en background
 * contra el server local. El dataset remoto (330 dispositivos) reemplaza al
 * demo (6) en el store reactivo cuando llega. Si falla la red, el adapter cae
 * al demo (offline-first F8A).
 *
 * El browser PWA (F1-baseline) no puede usar node:sqlite; en su lugar warmeza
 * el API server F8B (localhost:8787) que expone los 330 dispositivos reales.
 * Flag VITE_API overridea la URL (para CI/entornos distintos a localhost). */
let httpWarmer: Promise<void> | null = null
export function warmezaHttpSiDisponible(): Promise<void> {
  const apiBase =
    (import.meta.env as Record<string, unknown> ?? {}).VITE_API === undefined
      ? undefined
      : ((import.meta.env as Record<string, string>).VITE_API ?? '')
  const base = apiBase && apiBase.length > 0 ? apiBase : 'http://127.0.0.1:8787'
  if (httpWarmer) return httpWarmer
  const adapter = new HttpUiRepos(base)
  httpWarmer = adapter
    .buildServices()
    .then((services) => setServices(services))
    .catch((err: unknown) => {
      // Red caida: NO setServices(demo) — machacaria el dataset actual
      // (demo inicial, SQLite inyectado en tests o remoto ya warmeado).
      console.warn(
        '[HTTP UI] pull F8B fallido, se conserva el dataset actual:',
        err instanceof Error ? err.message : err,
      )
    })
  return httpWarmer
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
    quality: new InMemoryQualityRepository(data),
    asistente: new UiAssistantRepoDemo(data),
    dataset: data,
  }
}

interface ServiceStore {
  services: AppServices
  /** Versión del dataset cargado (demo vs remoto), para re-renders. */
  revision: number
}

export const useServices = create<ServiceStore>((set) => ({
  services: resolveServices(),
  revision: 0,
}))

/** Permite a los tests inyectar un dataset controlado o el motor SQLite real. */
export function setServices(services: AppServices): void {
  useServices.setState((prev) => ({ services, revision: prev.revision + 1 }))
}