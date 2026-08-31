import { create } from 'zustand'
import { useServices } from '../composition-root.js'
import type { Device, Category } from '@netatlas/domain'

/**
 * ViewModel de catálogo (MVVM §6.1).
 * Expone categorías (árbol) y consultas de dispositivo vía repositorio.
 * Los componentes no tocan el adaptador directamente: solo el ViewModel.
 */
interface CatalogState {
  categories: readonly Category[]
  loading: boolean
  load: () => Promise<void>
  deviceBySlug: (slug: string) => Promise<Device | undefined>
  devicesByCategory: (code: string) => Promise<readonly Device[]>
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  categories: [],
  loading: false,
  load: async () => {
    if (get().categories.length > 0) return
    set({ loading: true })
    const { catalog } = useServices.getState().services
    const categories = await catalog.listCategories()
    set({ categories, loading: false })
  },
  deviceBySlug: async (slug) => {
    const { devices } = useServices.getState().services
    return devices.findBySlug(slug)
  },
  devicesByCategory: async (code) => {
    const { devices } = useServices.getState().services
    const page = await devices.listByCategory(code, { limit: 200 })
    return page.items
  },
}))

/** Raíz de cada macrocategoría para agrupar el árbol del explorador (§10.4). */
export function rootCategories(categories: readonly Category[]): readonly Category[] {
  return categories.filter((c) => c.parentCode === undefined)
}

export function childrenOf(categories: readonly Category[], parentCode: string): readonly Category[] {
  return categories.filter((c) => c.parentCode === parentCode)
}