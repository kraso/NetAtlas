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
  /** Último fallo del autocompletado; la caja lo muestra con `role="alert"`. */
  readonly error: string | undefined
  buscar(prefix: string): Promise<void>
  guardar(query: string): void
  eliminarGuardada(query: string): void
}

const STORAGE_KEY = 'netatlas.busquedas.guardadas'
const MAX_GUARDADAS = 20

function leerGuardadas(): { guardadas: string[]; error: string | undefined } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { guardadas: [], error: undefined }
    const parsed: unknown = JSON.parse(raw)
    // El cast no valida: una forma inesperada se descarta y se avisa en la caja.
    if (!Array.isArray(parsed) || parsed.some((q) => typeof q !== 'string')) {
      console.warn('[autocomplete] historial guardado con forma inválida; se descarta')
      return { guardadas: [], error: 'No se pudieron leer las búsquedas guardadas.' }
    }
    return { guardadas: parsed, error: undefined }
  } catch (error) {
    // El historial no es crítico y se parte de cero, pero el fallo se registra
    // con contexto y viaja a la UI en vez de tragarse (AGENTS.md).
    console.warn('[autocomplete] historial guardado ilegible; se ignora', { error })
    return { guardadas: [], error: 'No se pudieron leer las búsquedas guardadas.' }
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

/**
 * Persiste el historial. Si el navegador rechaza la escritura (cuota, modo
 * privado) se registra y se devuelve el mensaje, en vez de dejar la lista como
 * si se hubiera guardado.
 */
function persistirGuardadas(guardadas: readonly string[]): string | undefined {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guardadas))
    return undefined
  } catch (error) {
    console.warn('[autocomplete] no se pudo persistir el historial', { error })
    return 'No se pudieron guardar las búsquedas.'
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

// La lectura inicial entra al estado por el mismo canal de error que `buscar`.
export const useAutocompleteStore = create<AutocompleteState>((set) => ({
  ...leerGuardadas(),
  sugerencias: [],
  cargando: false,
  buscar: async (prefix) => {
    if (prefix.trim().length < 2) {
      set({ sugerencias: [], cargando: false, error: undefined })
      return
    }
    set({ cargando: true, error: undefined })
    try {
      const grouped = await suggestGrouped(buildPorts(), { prefix, limitPerGroup: 5 })
      set({ sugerencias: proyectarSugerencias(grouped), cargando: false })
    } catch (error) {
      // El fallo se registra, se comunica en la caja y el estado no se queda
      // cargando para siempre.
      console.warn('[autocomplete] la sugerencia falló; se limpia el estado', { error })
      set({ sugerencias: [], cargando: false, error: 'No se pudieron cargar las sugerencias.' })
    }
  },
  guardar: (query) => {
    const q = query.trim()
    if (!q) return
    const actual = useAutocompleteStore.getState().guardadas
    const siguientes = [q, ...actual.filter((x) => x !== q)].slice(0, MAX_GUARDADAS)
    const error = persistirGuardadas(siguientes)
    // Sin escritura no hay lista nueva: se conserva la anterior en vez de mentir.
    set({ guardadas: error ? actual : siguientes, error })
  },
  eliminarGuardada: (query) => {
    const actual = useAutocompleteStore.getState().guardadas
    const siguientes = actual.filter((x) => x !== query)
    const error = persistirGuardadas(siguientes)
    set({ guardadas: error ? actual : siguientes, error })
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
