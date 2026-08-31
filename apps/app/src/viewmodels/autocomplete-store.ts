import { create } from 'zustand'
import { useServices } from '../composition-root.js'

/**
 * Autocompletado agrupado + búsquedas guardadas (NET-HW-014).
 * Las búsquedas guardadas persisten en localStorage (clave namespaced).
 */

export interface Sugerencia {
  readonly tipo: string
  readonly slug: string
  readonly label: string
}

interface AutocompleteState {
  readonly sugerencias: readonly Sugerencia[]
  readonly guardadas: readonly string[]
  readonly cargando: boolean
  buscar: (prefix: string) => Promise<void>
  guardar: (query: string) => void
  eliminarGuardada: (query: string) => void
}

const STORAGE_KEY = 'netatlas.busquedas.guardadas'
const MAX_GUARDADAS = 20

function leerGuardadas(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export const useAutocompleteStore = create<AutocompleteState>((set, get) => ({
  sugerencias: [],
  guardadas: leerGuardadas(),
  cargando: false,

  buscar: async (prefix) => {
    if (prefix.trim().length < 2) {
      set({ sugerencias: [], cargando: false })
      return
    }
    set({ cargando: true })
    const grouped = await useServices.getState().services.search.suggestGrouped(prefix, 5)
    const planas: Sugerencia[] = []
    for (const [tipo, items] of Object.entries(grouped)) {
      for (const item of items) planas.push({ tipo, slug: item.slug, label: item.label })
    }
    set({ sugerencias: planas, cargando: false })
  },

  guardar: (query) => {
    const q = query.trim()
    if (!q) return
    const actual = get().guardadas
    const siguientes = [q, ...actual.filter((x) => x !== q)].slice(0, MAX_GUARDADAS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(siguientes))
    set({ guardadas: siguientes })
  },

  eliminarGuardada: (query) => {
    const siguientes = get().guardadas.filter((x) => x !== query)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(siguientes))
    set({ guardadas: siguientes })
  },
}))

/** Convierte el slug de una sugerencia a su ruta en la app. */
export function rutaDeSugerencia(tipo: string, slug: string): string {
  switch (tipo) {
    case 'Dispositivos': return `/device/${slug}`
    case 'Protocolos': return `/protocolo/${slug}`
    case 'Estándares': return `/estandar/${slug.replace('/', '/')}`
    case 'Medios': return `/medio/${slug}`
    case 'Categorías': return `/explore?cat=${slug}`
    case 'Fabricantes': return `/fabricante/${slug}`
    default: return `/explore?q=${encodeURIComponent(slug)}`
  }
}