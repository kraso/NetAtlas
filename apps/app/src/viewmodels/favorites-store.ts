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

/** Exige la forma esperada del JSON persistido: lista de favoritos completos. */
function parsearFavoritos(raw: string): readonly Favorito[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some((f) => !esFavorito(f))) {
    throw new Error('la lista guardada tiene forma inválida')
  }
  return parsed
}

/** Escribe la lista; un almacenamiento caído se registra y se propaga. */
function escribir(valor: readonly Favorito[]): void {
  try {
    localStorage.setItem(K_FAVORITOS, JSON.stringify(valor))
  } catch (error) {
    console.warn('[favoritos] no se pudieron guardar en el navegador', { error })
    throw error
  }
}

const localStorageAdapter: FavoritesPort = {
  async list(): Promise<readonly Favorito[]> {
    const raw = localStorage.getItem(K_FAVORITOS)
    if (!raw) return []
    try {
      return parsearFavoritos(raw)
    } catch (error) {
      // Dato corrupto: se registra y se propaga para que `sincronizar`/`alternar`
      // lo comuniquen en la ficha, en vez de dar por bueno un histórico vacío.
      console.warn('[favoritos] la lista guardada tiene forma inválida; sube a la UI', { error })
      throw error
    }
  },
  async add(entidad: string): Promise<void> {
    const actuales = await localStorageAdapter.list()
    const next = [...actuales, { perfilId: 'local', entidad, createdAt: new Date().toISOString() } as Favorito]
    escribir(next)
  },
  async remove(entidad: string): Promise<void> {
    const actuales = await localStorageAdapter.list()
    escribir(actuales.filter((f) => f.entidad !== entidad))
  },
}

interface FavoritosState {
  favoritos: readonly Favorito[]
  loading: boolean
  /** Último fallo al leer o tocar favoritos; la ficha lo muestra con `role="alert"`. */
  error: string | undefined
  alternar(entidad: string): Promise<void>
  sincronizar(): Promise<void>
}

export const useFavoritosStore = create<FavoritosState>((set) => ({
  favoritos: [],
  loading: false,
  error: undefined,
  alternar: async (entidad: string) => {
    set({ loading: true, error: undefined })
    try {
      const res = await manageFavorites(
        { favorites: localStorageAdapter },
        { entidad: normalizar(entidad), action: 'toggle' },
      )
      set({ favoritos: res.favoritos, loading: false })
    } catch (error) {
      // Almacenamiento caído o dato corrupto: se registra, se comunica en la
      // ficha y el estado no se queda cargando para siempre.
      console.error('[favoritos] no se pudo alternar el favorito; la lista no cambia', { entidad, error })
      set({ loading: false, error: 'No se pudo actualizar el favorito.' })
    }
  },
  sincronizar: async () => {
    try {
      set({ favoritos: await localStorageAdapter.list(), error: undefined })
    } catch (error) {
      console.warn('[favoritos] no se pudo leer la lista guardada', { error })
      // Sin lectura no hay lista que mostrar: el estado no puede dar por buenos
      // favoritos que no pudo leer.
      set({ favoritos: [], error: 'No se pudieron leer los favoritos guardados.' })
    }
  },
}))

export function useEsFavorito(entidad: string): boolean {
  return useFavoritosStore((s) => s.favoritos.some((f) => f.entidad === normalizar(entidad)))
}
