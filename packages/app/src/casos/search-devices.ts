/**
 * Caso de uso: Búsqueda de dispositivos (NET-HW-011/012/013).
 *
 * Orquesta el puerto `SearchPort` (DSL → FTS5/SQL) y expone un resultado proyectado.
 * La lógica de parseo DSL ya vive en `@netatlas/domain` (parseDsl); aquí se
 * orquesta: delegar la búsqueda, extraer términos de campo para el preview
 * educativo (§12.6) y devolver hits + total + facetas.
 */
import type { SearchHit, SearchResponse, SearchPort } from '../index.js'

export interface SearchDevicesInput {
  readonly rawQuery: string
  readonly limit: number
  readonly offset?: number
  readonly facetFilters?: Record<string, string[]>
}

export interface SearchDevicesResult {
  readonly hits: readonly SearchHit[]
  readonly total: number
  readonly loading: boolean
  /** Términos de campo extraídos del DSL para el preview educativo (§12.6). */
  readonly dslPreview: readonly string[]
}

/** Extrae tokens de campo (contienen ':') del DSL para el preview educativo (§12.6). */
export function dslTerminos(query: string): readonly string[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  return tokens.filter((t) => t.includes(':'))
}

/**
 * Ejecuta la búsqueda: delega al puerto SearchIndex y proyecta el resultado.
 * Puro: no muta estado, no depende de UI ni de SQLite.
 */
export async function searchDevices(
  ports: { search: SearchPort },
  input: SearchDevicesInput,
): Promise<SearchDevicesResult> {
  const res: SearchResponse = await ports.search.query({
    rawQuery: input.rawQuery,
    limit: input.limit,
    offset: input.offset,
    facetFilters: input.facetFilters,
  })
  return {
    hits: res.hits,
    total: res.total,
    loading: false,
    dslPreview: dslTerminos(input.rawQuery),
  }
}
