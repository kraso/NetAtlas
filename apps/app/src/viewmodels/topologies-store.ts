import { create } from 'zustand'
import { useServices } from '../composition-root.js'
import type { Topology } from '@netatlas/domain'

/**
 * ViewModel de topologías (F4 / MVVM §6.1): lista, ficha por slug y
 * operaciones de escritura (layout, laboratorio). Los componentes solo hablan
 * con el ViewModel, nunca con el adaptador.
 */

interface TopologiesState {
  topologies: readonly Topology[]
  loading: boolean
  load: () => Promise<void>
  bySlug: (slug: string) => Promise<Topology | undefined>
  saveLayout: (slug: string, positions: ReadonlyArray<{ nodeId: string; x: number; y: number }>) => Promise<void>
  upsert: (t: Topology) => Promise<void>
  remove: (slug: string) => Promise<void>
}

let cache = new Map<string, Topology>()

export const useTopologiesStore = create<TopologiesState>((set, get) => ({
  topologies: [],
  loading: false,
  load: async () => {
    if (get().topologies.length > 0) return
    set({ loading: true })
    const { topologies } = useServices.getState().services
    const lista = await topologies.list()
    cache = new Map(lista.map((t) => [t.slug.value, t]))
    set({ topologies: lista, loading: false })
  },
  bySlug: async (slug) => {
    const cached = cache.get(slug)
    if (cached) return cached
    const { topologies } = useServices.getState().services
    const t = await topologies.bySlug(slug)
    if (t) cache.set(slug, t)
    return t
  },
  saveLayout: async (slug, positions) => {
    const { topologies } = useServices.getState().services
    await topologies.saveLayout(slug, positions)
    const actualizada = await topologies.bySlug(slug)
    if (actualizada) {
      cache.set(slug, actualizada)
      set({ topologies: await topologies.list() })
    }
  },
  upsert: async (t) => {
    const { topologies } = useServices.getState().services
    await topologies.upsert(t)
    cache.set(t.slug.value, t)
    set({ topologies: await topologies.list() })
  },
  remove: async (slug) => {
    const { topologies } = useServices.getState().services
    await topologies.remove(slug)
    cache.delete(slug)
    set({ topologies: await topologies.list() })
  },
}))

/** Carga inicial de la lista (se invoca desde el visor de topologías). */
export async function cargarTopologias(): Promise<void> {
  await useTopologiesStore.getState().load()
}