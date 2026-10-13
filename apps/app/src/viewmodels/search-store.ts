import { create } from 'zustand'
import { searchDevices, dslTerminos } from '@netatlas/application/casos/search-devices'
import type { SearchPort } from '@netatlas/application'
import type { SearchHit, SearchResponse } from '@netatlas/domain'
import { useServices } from '../composition-root.js'

/**
 * ViewModel de búsqueda (MVVM).
 *
 * LA LÓGICA DE ORQUESTACIÓN (parse DSL + delegación al puerto)
 * se extrajo al caso de uso `searchDevices` en @netatlas/application (ADR-047).
 * Este store SOLO mantiene el estado local (zustand) y delega.
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

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  total: 0,
  loading: false,
  dslPreview: [],
  setQuery: (q: string) => set({ query: q, dslPreview: dslTerminos(q) }),
  search: async () => {
    const { search } = useServices.getState().services
    const port: SearchPort = {
      query: async (req): Promise<SearchResponse> => search.query(req),
      suggest: (prefix: string, limit: number) => search.suggest(prefix, limit),
      suggestGrouped: (prefix: string, limitPerGroup: number) =>
        search.suggestGrouped(prefix, limitPerGroup),
    }
    set({ loading: true })
    try {
      const res = await searchDevices({ search: port }, { rawQuery: get().query, limit: 50 })
      set({
        results: res.hits,
        total: res.total,
        dslPreview: res.dslPreview,
        loading: false,
      })
    } catch (error) {
      // El fallo se registra y el estado no se queda cargando para siempre.
      console.warn('[busqueda] la consulta falló; se limpia el estado', { error })
      set({ results: [], total: 0, loading: false })
    }
  },
}))
