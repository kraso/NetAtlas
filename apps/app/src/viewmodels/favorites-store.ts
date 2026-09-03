import { create } from 'zustand'
import { manageFavorites } from '@netatlas/app/casos/manage-favorites'
import type { FavoritesPort, Favorito } from '@netatlas/app'

const K_FAVORITOS = 'netatlas.favorites.v1'

/** Normaliza slugs externos al formato dominio `device:slug` (F8B). */
function normalizar(entidad: string): string {
  return entidad.startsWith('device:') ? entidad : `device:${entidad}`
}

const localStorageAdapter: FavoritesPort = {
  async list(): Promise<readonly Favorito[]> {
    try {
      const raw = localStorage.getItem(K_FAVORITOS)
      return raw ? (JSON.parse(raw) as Favorito[]) : []
    } catch {
      return []
    }
  },
  async add(entidad: string): Promise<void> {
    const actuales = await localStorageAdapter.list()
    const next = [...actuales, { perfilId: 'local', entidad, createdAt: new Date().toISOString() } as Favorito]
    localStorage.setItem(K_FAVORITOS, JSON.stringify(next))
  },
  async remove(entidad: string): Promise<void> {
    const actuales = await localStorageAdapter.list()
    localStorage.setItem(K_FAVORITOS, JSON.stringify(actuales.filter((f) => f.entidad !== entidad)))
  },
}

interface FavoritosState {
  favoritos: readonly Favorito[]
  loading: boolean
  alternar(entidad: string): Promise<void>
  sincronizar(): Promise<void>
}

export const useFavoritosStore = create<FavoritosState>((set) => ({
  favoritos: [],
  loading: false,
  alternar: async (entidad: string) => {
    set({ loading: true })
    const res = await manageFavorites(
      { favorites: localStorageAdapter },
      { entidad: normalizar(entidad), action: 'toggle' },
    )
    set({ favoritos: res.favoritos, loading: false })
  },
  sincronizar: async () => {
    const actuales = await localStorageAdapter.list()
    set({ favoritos: actuales })
  },
}))

export function useEsFavorito(entidad: string): boolean {
  return useFavoritosStore((s) => s.favoritos.some((f) => f.entidad === normalizar(entidad)))
}
