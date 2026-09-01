import { create } from 'zustand'

/**
 * Favoritos del usuario (F8B, NET-HW-064): persistencia local en el
 * dispositivo (localStorage). La referencia a entidad usa el formato
 * `tipo:slug` del dominio (`esEntidadValida`), listo para sincronizar con la
 * API pública v1 (GET/POST/DELETE /v1/favorites) cuando haya red — el contrato
 * de datos es el mismo.
 */

export interface FavoritoLocal {
  readonly entidad: string
  readonly createdAt: string
}

const K_FAVORITOS = 'netatlas.favorites.v1'

function leerLocal(): readonly FavoritoLocal[] {
  try {
    const raw = localStorage.getItem(K_FAVORITOS)
    return raw ? (JSON.parse(raw) as FavoritoLocal[]) : []
  } catch {
    return []
  }
}

function guardar(lista: readonly FavoritoLocal[]): void {
  try {
    localStorage.setItem(K_FAVORITOS, JSON.stringify(lista))
  } catch {
    // Sin almacenamiento: no persiste pero no falla.
  }
}

interface FavoritosState {
  favoritos: readonly FavoritoLocal[]
  alternar(entidad: string): void
  /** Recarga desde localStorage (llamada al montar). */
  sincronizar(): void
}

function normalizar(entidad: string): string {
  return entidad.startsWith('device:') ? entidad : `device:${entidad}`
}

export const useFavoritosStore = create<FavoritosState>((set) => ({
  favoritos: leerLocal(),

  alternar(entidad: string): void {
    const e = normalizar(entidad)
    const actuales = leerLocal()
    const existe = actuales.some((f) => f.entidad === e)
    const siguientes = existe
      ? actuales.filter((f) => f.entidad !== e)
      : [...actuales, { entidad: e, createdAt: new Date().toISOString() }]
    guardar(siguientes)
    set({ favoritos: siguientes })
  },

  sincronizar(): void {
    set({ favoritos: leerLocal() })
  },
}))

/**
 * Hook auxiliar: ¿está la entidad en favoritos? Se suscribe al ARRAY (nuevo
 * objeto en cada cambio), de modo que el componente re-renderiza al alternar.
 */
export function useEsFavorito(entidad: string): boolean {
  const e = normalizar(entidad)
  return useFavoritosStore((s) => s.favoritos.some((f) => f.entidad === e))
}