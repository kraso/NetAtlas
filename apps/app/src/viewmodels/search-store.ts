import { create } from 'zustand'
import { useServices } from '../composition-root.js'
import type { SearchHit, DslTermino } from '@netatlas/domain'

/**
 * ViewModel de búsqueda (MVVM).
 * La consulta se delega al puerto SearchIndex; los resultados son proyección
 * (nunca objetos vivos de infraestructura).
 */
interface SearchState {
  query: string
  results: readonly SearchHit[]
  total: number
  loading: boolean
  dslPreview: readonly string[]
  setQuery: (q: string) => void
  search: () => Promise<void>
}

/** Extrae términos de campo del DSL para el preview educativo (§12.6). */
export function dslTerminos(query: string): readonly string[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  return tokens.filter((t) => t.includes(':'))
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  total: 0,
  loading: false,
  dslPreview: [],
  setQuery: (q) => set({ query: q, dslPreview: dslTerminos(q) }),
  search: async () => {
    const { search } = useServices.getState().services
    const query = get().query
    set({ loading: true })
    const res = await search.query({ rawQuery: query, limit: 50 })
    set({ results: res.hits, total: res.total, loading: false })
  },
}))