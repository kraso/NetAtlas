/**
 * Casos de uso orquestadores de NetAtlas (§26 del PLAN MAESTRO).
 *
 * Este paquete vive entre el dominio puro (`@netatlas/domain`) y la
 * infraestructura (`@netatlas/data`, `@netatlas/search`) / presentación
 * (`apps/app`). Su razón de ser — y la decisión arquitectónica que la justifica —
 * es separar la ORQUESTACIÓN de la UI, de modo que:
 *
 * 1. Los casos de uso son puros, testeables sin React ni SQLite.
 * 2. El servidor (F8A/F8B) puede reutilizarlos para generar respuestas API
 *    (p. ej. sugerencias agrupadas, importación con reporte) sin duplicar lógica.
 * 3. La UI se reduce a proyecciones MVVM: los viewmodels llaman a un caso de
 *    uso en lugar de manipular repositorios directamente.
 *
 * Regla de dependencias (hexagonal §6): este paquete IMPORTA puertos de
 * `@netatlas/domain` y define puertos secundarios para los adaptadores, pero
 * NUNCA al revés: ni `@netatlas/data` ni `apps/app` importan de este paquete
 * solo para tipos (los adaptadores implementan estos puertos).
 */

import type {
  Device,
  Category,
  Manufacturer,
  SearchHit,
  SuggestResult,
  Favorito,
  SearchResponse,
  DslTermino,
  Page,
  DeviceQuery,
  Relationship,
  GraphRepository,
} from '@netatlas/domain'

// ── Tipos compartidos del catálogo cerrado ──────────────────────────────────

/** Protocolo del catálogo cerrado (§14). */
export interface ProtocoloCat {
  readonly code: string
  readonly name: string
  readonly family: string
  readonly osiLayer: number
}

/** Fila genérica del catálogo cerrado para exploradores bidireccionales (NET-HW-023). */
export interface CatalogoFila {
  readonly slug: string
  readonly label: string
}

// ── Puertos secundarios (lo que la UI/infraestructura provee al caso de uso) ──

/** Puerto de catálogo cerrado (NET-HW-005/006). */
export interface CatalogPort {
  listCategories(): Promise<readonly Category[]>
  listManufacturers(): Promise<readonly Manufacturer[]>
  manufacturerBySlug(slug: string): Promise<Manufacturer | undefined>
  categoryByCode(code: string): Promise<Category | undefined>
  listProtocols(): Promise<readonly ProtocoloCat[]>
  listStandards(): Promise<readonly CatalogoFila[]>
  listMedia(): Promise<readonly CatalogoFila[]>
}

/** Puerto de dispositivo (NET-HW-003). */
export interface DevicePort {
  findBySlug(slug: string): Promise<Device | undefined>
  listByCategory(categoryCode: string, query: DeviceQuery): Promise<Page<Device>>
  findByManufacturer(manufacturerSlug: string, query: DeviceQuery): Promise<Page<Device>>
  count(): Promise<number>
}

/** Puerto de búsqueda (NET-HW-011/012/013/014). */
export interface SearchPort {
  query(request: {
    rawQuery: string
    limit: number
    offset?: number
    facetFilters?: Record<string, string[]>
  }): Promise<SearchResponse>
  suggest(prefix: string, limit: number): Promise<readonly SuggestResult[]>
  suggestGrouped(prefix: string, limitPerGroup: number): Promise<Readonly<Record<string, readonly { slug: string; label: string }[]>>>
}

/** Puerto de favoritos (F8B, NET-HW-064). */
export interface FavoritesPort {
  list(): Promise<readonly Favorito[]>
  add(entidad: string): Promise<void>
  remove(entidad: string): Promise<void>
}

/** Contrato EAV para las vistas (§9.4) — implementa @netatlas/data + in-memory. */
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

export interface UiDeviceAttributeValue {
  readonly key: string
  readonly labelEs: string
  readonly valueType: UiAttributeDefinition['valueType']
  readonly unit?: string
  readonly display: string
}

export interface AttributesPort {
  attributeDefinitionsByCategory(code: string): Promise<readonly UiAttributeDefinition[]>
  attributeValuesForDevice(slug: string): Promise<readonly UiDeviceAttributeValue[]>
}

/** Puerto de grafo (§9.5) — re-export del dominio + vecindad/tipos UI. */
export type { GraphRepository, Relationship, NeighborsQuery, Path } from '@netatlas/domain'
export type { NodeType, GraphNode } from '@netatlas/domain'

// ── Re-exports del dominio que los casos de uso exponen a la UI ────────────────
export type {
  SearchHit,
  SuggestResult,
  SearchResponse,
  Favorito,
  Page,
  DeviceQuery,
} from '@netatlas/domain'

// ── Casos de uso ──────────────────────────────────────────────────────────────
export { dslTerminos, searchDevices, type SearchDevicesInput, type SearchDevicesResult } from './casos/search-devices.js'
export { suggestGrouped } from './casos/suggest-grouped.js'
export { compareDevicesUseCase, type CompareInput } from './casos/compare-devices.js'
export { manageFavorites, type FavoritesAction } from './casos/manage-favorites.js'
export { buildLocalGraph, type BuildLocalGraphInput, type BuildLocalGraphOutput } from './casos/build-local-graph.js'
export { buildGlobalGraph, type GlobalMapInput, type BuildGlobalGraphOutput } from './casos/build-global-graph.js'
export { importarLote, type ImportarLoteInput, type ImportarLoteResult } from './casos/importar-lote.js'

// ── Proyecciones UI ────────────────────────────────────────────────────────────
export { buildSubgraph, dedup, type UiGraphSubgraph, type UiGraphNode, type UiGraphEdge } from './projections/subgraph.js'
