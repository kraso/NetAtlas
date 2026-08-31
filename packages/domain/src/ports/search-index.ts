import type { Speed } from '../value-objects/speed.js'

/** Un hit de búsqueda con score opaco (sección 12.5: cambiar FTS por híbrido no toca la UI). */
export interface SearchHit {
  readonly entityType: 'device' | 'category' | 'protocol' | 'standard' | 'manufacturer'
  readonly slug: string
  readonly name: string
  readonly score: number
}

export interface FacetValue {
  readonly value: string
  readonly count: number
}

export interface SearchFacets {
  readonly category: readonly FacetValue[]
  readonly lifecycleStatus: readonly FacetValue[]
  readonly manufacturer: readonly FacetValue[]
}

export interface SearchRequest {
  readonly rawQuery: string
  readonly limit: number
  readonly offset?: number | undefined
  readonly facetFilters?: Record<string, string[]> | undefined
}

export interface SearchResponse {
  readonly hits: readonly SearchHit[]
  readonly total: number
  readonly facets: SearchFacets
}

export interface SuggestResult {
  readonly entityType: SearchHit['entityType']
  readonly slug: string
  readonly label: string
}

/**
 * Puerto SearchIndex (sección 6.6 / 12). El contrato es estable:
 * `query` recibe una cadena y devuelve hits con score opaco.
 */
export interface SearchIndex {
  query(request: SearchRequest): Promise<SearchResponse>
  suggest(prefix: string, limit: number): Promise<readonly SuggestResult[]>
  /** Requisito de búsqueda por velocidad máxima soportada. */
  byMaxSpeed(minSpeed: Speed, query: SearchRequest): Promise<SearchResponse>
}