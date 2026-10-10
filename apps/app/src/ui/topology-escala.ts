import React from 'react'
import { agregarTopologia, decidirModoRender, UMBRAL_AGREGACION, type AristaFuente, type NodoFuente, type ResolverCategoria, type TopologiaAgregada, type Topology } from '@netatlas/domain'
import { useServices } from '../composition-root.js'
import { useCatalogStore } from '../viewmodels/catalog-store.js'
import type { ModoRender } from './topology-viewer-model.js'

/**
 * Escalado del visor (F4 refinamiento / ADR-03): modo de render según el
 * número de nodos — >1.500 agregado por categoría, >5.000 Canvas ligero.
 */

export interface VistaEscala {
  readonly agregada: TopologiaAgregada | undefined
  readonly modo: ModoRender
}

export function useVistaEscala(topologia: Topology): VistaEscala {
  const mapaCategorias = useMapaCategorias()
  // Resolver de categoría para la vista agregada: mapa síncrono (slug → code).
  const resolverCategoria: ResolverCategoria = (slug: string): string | undefined => mapaCategorias.current.get(slug)
  const agregada = React.useMemo<TopologiaAgregada | undefined>(
    () => calcularAgregada(topologia, resolverCategoria),
    [topologia],
  )
  const modo: ModoRender = decidirModoRender(agregada?.nodosOriginales ?? topologia.nodes.length)
  return { agregada, modo }
}

/** Vista agregada por categoría: `undefined` mientras no se supera el umbral. */
function calcularAgregada(topologia: Topology, resolverCategoria: ResolverCategoria): TopologiaAgregada | undefined {
  if (topologia.nodes.length < UMBRAL_AGREGACION) return undefined
  const fuenteNodos: readonly NodoFuente[] = topologia.nodes.map((n) => ({
    id: n.id,
    entityType: n.entityType === 'category' ? ('category' as const) : ('device' as const),
    entitySlug: n.entitySlug,
    layerHint: n.layerHint,
  }))
  const fuenteAristas: readonly AristaFuente[] = topologia.edges.map((e) => ({ from: e.from, to: e.to }))
  return agregarTopologia(fuenteNodos, fuenteAristas, resolverCategoria)
}

/** Carga una sola vez el mapa slug → código de categoría desde el catálogo. */
function useMapaCategorias(): { readonly current: ReadonlyMap<string, string> } {
  const mapaCategorias = React.useRef<ReadonlyMap<string, string>>(new Map())
  React.useEffect(() => {
    void (async () => {
      const mapa = await cargarMapaCategorias()
      if (mapa) mapaCategorias.current = mapa
    })()
  }, [])
  return mapaCategorias
}

/**
 * Mapa slug → código de categoría desde el catálogo (demo in-memory o SQLite,
 * el mismo contrato). `undefined` si el catálogo aún no está disponible.
 */
async function cargarMapaCategorias(): Promise<ReadonlyMap<string, string> | undefined> {
  const { devices } = useServices.getState().services
  const categories = useCatalogStore.getState().categories
  if (categories.length === 0) return undefined
  // Carga paginada por categoría raíz (el demo devuelve todo; SQLite igual).
  const raices = categories.filter((c) => c.parentCode === undefined).map((c) => c.code)
  const raiz = raices[0] ?? categories[0]?.code
  if (!raiz) return undefined
  try {
    const page = await devices.listByCategory(raiz, { limit: 5000 })
    const mapa = new Map<string, string>()
    for (const d of page.items) mapa.set(d.slug.value, d.categoryCode)
    return mapa
  } catch (error) {
    // Catálogo no disponible aún: la vista agregada cae a sueltos.
    console.warn('[WARN] no se pudo cargar el mapa de categorías de la vista agregada', { error })
    return undefined
  }
}
