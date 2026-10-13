import { create } from 'zustand'
import { suggestGrouped } from '@netatlas/application/casos/suggest-grouped'
import type { SearchPort, CatalogPort } from '@netatlas/application'
import { useServices } from '../composition-root.js'

/**
 * Autocompletado agrupado + búsquedas guardadas (NET-HW-014).
 *
 * LA LÓGICA DE ORQUESTACIÓN (suggestGrouped + filtrado/slice) se extrajo al
 * caso de uso `suggestGrouped` en @netatlas/application (ADR-047). Este store SOLO
 * mantiene el estado local (zustand) y proyecta a Sugerencia[] planas.
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
  buscar(prefix: string): Promise<void>
  guardar(query: string): void
  eliminarGuardada(query: string): void
}

const STORAGE_KEY = 'netatlas.busquedas.guardadas'
const MAX_GUARDADAS = 20

function leerGuardadas(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // El cast no valida: una forma inesperada se descarta y se registra.
    if (!Array.isArray(parsed) || parsed.some((q) => typeof q !== 'string')) {
      console.warn('[autocomplete] historial guardado con forma inválida; se descarta')
      return []
    }
    return parsed
  } catch (error) {
    // Best-effort explícito: el historial guardado no es crítico y se parte de
    // cero, pero el fallo se registra en lugar de tragarse (AGENTS.md).
    console.warn('[autocomplete] historial guardado ilegible; se ignora', { error })
    return []
  }
}

/** Aplana las sugerencias agrupadas a la lista que consume la UI. */
function proyectarSugerencias(grouped: Awaited<ReturnType<typeof suggestGrouped>>): Sugerencia[] {
  const planas: Sugerencia[] = []
  for (const [tipo, items] of Object.entries(grouped)) {
    for (const item of items) planas.push({ tipo, slug: item.slug, label: item.label })
  }
  return planas
}

/** Persistencia del historial: best-effort registrado (cuota, modo privado). */
function persistirGuardadas(guardadas: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guardadas))
  } catch (error) {
    console.warn('[autocomplete] no se pudo persistir el historial', { error })
  }
}

/** Adapta UiSearchRepo/UiCatalogRepo a los puertos del caso de uso. */
function buildPorts(): { search: SearchPort; catalog: CatalogPort } {
  const services = useServices.getState().services
  return {
    // Arrow functions preservan `this` del repositorio concreto (InMemory/SQLite)
    search: {
      query: (req) => services.search.query(req),
      suggest: (prefix, limit) => services.search.suggest(prefix, limit),
      suggestGrouped: (prefix, limitPerGroup) => services.search.suggestGrouped(prefix, limitPerGroup),
    },
    catalog: {
      listCategories: () => services.catalog.listCategories(),
      manufacturerBySlug: (slug) => services.catalog.manufacturerBySlug(slug),
      categoryByCode: (code) => services.catalog.categoryByCode(code),
      listProtocols: () => services.catalog.listProtocols(),
      listManufacturers: () => services.catalog.listManufacturers(),
      // Standards: {org,identifier,title} → proyectado a CatalogoFila {slug,label}
      listStandards: async () => (await services.catalog.listStandards()).map((s) => ({ slug: `${s.org}/${s.identifier}`, label: s.title })),
      // Media: {code,kind,name,...} → proyectado a CatalogoFila {slug,label}
      listMedia: async () => (await services.catalog.listMedia()).map((m) => ({ slug: m.code, label: m.name })),
    },
  }
}

export const useAutocompleteStore = create<AutocompleteState>((set) => ({
  sugerencias: [],
  guardadas: leerGuardadas(),
  cargando: false,
  buscar: async (prefix) => {
    if (prefix.trim().length < 2) {
      set({ sugerencias: [], cargando: false })
      return
    }
    set({ cargando: true })
    try {
      const grouped = await suggestGrouped(buildPorts(), { prefix, limitPerGroup: 5 })
      set({ sugerencias: proyectarSugerencias(grouped), cargando: false })
    } catch (error) {
      // El fallo se registra y el estado no se queda cargando para siempre.
      console.warn('[autocomplete] la sugerencia falló; se limpia el estado', { error })
      set({ sugerencias: [], cargando: false })
    }
  },
  guardar: (query) => {
    const q = query.trim()
    if (!q) return
    const actual = useAutocompleteStore.getState().guardadas
    const siguientes = [q, ...actual.filter((x) => x !== q)].slice(0, MAX_GUARDADAS)
    persistirGuardadas(siguientes)
    set({ guardadas: siguientes })
  },
  eliminarGuardada: (query) => {
    const siguientes = useAutocompleteStore.getState().guardadas.filter((x) => x !== query)
    persistirGuardadas(siguientes)
    set({ guardadas: siguientes })
  },
}))

/** Convierte el slug de una sugerencia a su ruta en la app. */
export function rutaDeSugerencia(tipo: string, slug: string): string {
  switch (tipo) {
    case 'Dispositivos':
      return `/device/${slug}`
    case 'Protocolos':
      return `/protocolo/${slug}`
    case 'Estándares':
      return `/estandar/${slug}`
    case 'Medios':
      return `/medio/${slug}`
    case 'Categorías':
      return `/explore?cat=${slug}`
    case 'Fabricantes':
      return `/fabricante/${slug}`
    default:
      return `/explore?q=${encodeURIComponent(slug)}`
  }
}
