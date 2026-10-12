import { create } from 'zustand'
import { manageFavorites } from '@netatlas/application/casos/manage-favorites'
import type { FavoritesPort, Favorito } from '@netatlas/application'

const K_FAVORITOS = 'netatlas.favorites.v1'

/** Normaliza slugs externos al formato dominio `device:slug` (F8B). */
function normalizar(entidad: string): string {
  return entidad.startsWith('device:') ? entidad : `device:${entidad}`
}

/** Guardarraíl del cast: un `Favorito` exige sus tres campos textuales. */
function esFavorito(valor: unknown): valor is Favorito {
  const f = valor as Partial<Favorito> | undefined
  return (
    typeof f?.perfilId === 'string' &&
    typeof f?.entidad === 'string' &&
    typeof f?.createdAt === 'string'
  )
}

const localStorageAdapter: FavoritesPort = {
  async list(): Promise<readonly Favorito[]> {
    try {
      const raw = localStorage.getItem(K_FAVORITOS)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      // El cast no valida: una forma inesperada se descarta y se registra.
      if (!Array.isArray(parsed) || parsed.some((f) => !esFavorito(f))) {
        console.warn('[favoritos] la lista guardada tiene forma inválida; se descarta')
        return []
      }
      return parsed
    } catch (error) {
      // Best-effort explícito: sin lista legible se parte de cero, pero el
      // fallo se registra en lugar de tragarse (AGENTS.md).
      console.warn('[favoritos] la lista guardada es ilegible; se parte de cero', { error })
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
    try {
      const res = await manageFavorites(
        { favorites: localStorageAdapter },
        { entidad: normalizar(entidad), action: 'toggle' },
      )
      set({ favoritos: res.favoritos, loading: false })
    } catch (error) {
      // El fallo se registra y el estado no se queda cargando para siempre.
      console.warn('[favoritos] la operación falló; la lista no cambia', { error })
      set({ loading: false })
    }
  },
  sincronizar: async () => {
    try {
      set({ favoritos: await localStorageAdapter.list() })
    } catch (error) {
      console.warn('[favoritos] no se pudo leer la lista guardada', { error })
    }
  },
}))

export function useEsFavorito(entidad: string): boolean {
  return useFavoritosStore((s) => s.favoritos.some((f) => f.entidad === normalizar(entidad)))
}
