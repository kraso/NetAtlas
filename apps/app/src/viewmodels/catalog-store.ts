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
  /** Última revisión del dataset (invalida el cache cuando el warmezo HTTP reemplaza services). */
  revisionVisto: number
  load: (force?: boolean) => Promise<void>
  deviceBySlug: (slug: string) => Promise<Device | undefined>
  devicesByCategory: (code: string) => Promise<readonly Device[]>
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  categories: [],
  loading: false,
  revisionVisto: 0,
  load: async (force = false) => {
    const revision = useServices.getState().revision
    if (!force && get().categories.length > 0 && get().revisionVisto === revision) return
    set({ loading: true, revisionVisto: revision })
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