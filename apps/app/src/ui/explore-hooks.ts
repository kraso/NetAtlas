import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  useCatalogStore,
  useSearchStore,
  type FacetaUI,
} from './explore-piezas.js'
import { useFacetasDeCategoria, useFiltroDeFacetas, useResultados } from './explore-carga-hooks.js'
import type { Category, Device } from '@netatlas/domain'

export interface ExploradorVista {
  readonly categories: readonly Category[]
  readonly selectedCat: string | null
  readonly query: string
  readonly visibles: readonly Device[]
  readonly loading: boolean
  readonly facetas: readonly FacetaUI[]
  readonly seleccion: Record<string, readonly string[]>
  readonly facetasActivas: number
  readonly marcados: ReadonlySet<string>
  readonly onSelectCat: (code: string) => void
  readonly onBuscar: (q: string) => void
  readonly onToggleValor: (key: string, valor: string) => void
  readonly onLimpiarFacetas: () => void
  readonly onToggleMarcar: (slug: string) => void
  readonly onCompararSeleccionados: () => void
}

/** Estado en curso del explorador (datos cargados + filtros y marcados). */
interface EstadoExplorador {
  resultados: readonly Device[]
  loading: boolean
  facetas: readonly FacetaUI[]
  seleccion: Record<string, readonly string[]>
  marcados: ReadonlySet<string>
  slugsFiltrados: ReadonlySet<string>
}

/**
 * Estado y manejadores del Explorador (§10.4): categoría y consulta del
 * querystring, carga de resultados y facetas EAV (F3), filtro por facetas y
 * selección múltiple hacia el comparador (CU-02). La vista solo proyecta.
 */
export function useExplorador(): ExploradorVista {
  const { params, setParams, navegar, selectedCat, query, setQuery } = useNavegacion()
  const estado = useEstadoExplorador(selectedCat, query)
  const visibles = useVisibles(estado, selectedCat)
  const facetasActivas = Object.keys(estado.seleccion).filter((k) => (estado.seleccion[k]?.length ?? 0) > 0).length

  return {
    categories: useCatalogStore((s) => s.categories),
    selectedCat,
    query,
    visibles,
    loading: estado.loading,
    facetas: estado.facetas,
    seleccion: estado.seleccion,
    facetasActivas,
    marcados: estado.marcados,
    ...accionesExplorador({ params, setParams, navegar, setQuery, estado, marcados: estado.marcados }),
  }
}

/** Acciones del explorador (categoría, consulta, facetas y marcados). */
function accionesExplorador(arg: {
  params: URLSearchParams
  setParams: (p: URLSearchParams) => void
  navegar: (to: string) => void
  setQuery: (q: string) => void
  estado: EstadoExplorador & { setSeleccion: (s: Record<string, readonly string[]>) => void; setMarcados: (m: ReadonlySet<string>) => void }
  marcados: ReadonlySet<string>
}): Pick<ExploradorVista, 'onSelectCat' | 'onBuscar' | 'onToggleValor' | 'onLimpiarFacetas' | 'onToggleMarcar' | 'onCompararSeleccionados'> {
  const { params, setParams, navegar, setQuery, estado, marcados } = arg
  return {
    onSelectCat: (code) => {
      const next = new URLSearchParams(params)
      next.set('cat', code)
      next.delete('q')
      setParams(next)
    },
    onBuscar: (v) => {
      const next = new URLSearchParams(params)
      if (v.trim()) {
        next.set('q', v.trim())
        next.delete('cat')
      } else {
        next.delete('q')
      }
      setParams(next)
      setQuery(v)
    },
    onToggleValor: (key, valor) => estado.setSeleccion(alternarValor(estado.seleccion, key, valor)),
    onLimpiarFacetas: () => estado.setSeleccion({}),
    onToggleMarcar: (slug) => estado.setMarcados(alternarSlug(marcados, slug)),
    onCompararSeleccionados: () => {
      const ids = [...marcados]
      if (ids.length >= 2) navegar(`/comparar?ids=${ids.join(',')}`)
    },
  }
}

/** Categoría y consulta desde el querystring, con sus setters. */
function useNavegacion(): {
  params: URLSearchParams
  setParams: (p: URLSearchParams) => void
  navegar: (to: string) => void
  selectedCat: string | null
  query: string
  setQuery: (q: string) => void
} {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const { setQuery } = useSearchStore()
  return { params, setParams, navegar, selectedCat: params.get('cat'), query: params.get('q') ?? '', setQuery }
}

/** Datos y filtros en curso del explorador, con sus setters. */
function useEstadoExplorador(selectedCat: string | null, query: string) {
  const [resultados, setResultados] = React.useState<readonly Device[]>([])
  const [loading, setLoading] = React.useState(false)
  const [facetas, setFacetas] = React.useState<readonly FacetaUI[]>([])
  const [seleccion, setSeleccion] = React.useState<Record<string, readonly string[]>>({})
  const [marcados, setMarcados] = React.useState<ReadonlySet<string>>(new Set())
  const [slugsFiltrados, setSlugsFiltrados] = React.useState<ReadonlySet<string>>(new Set())
  const facetasActivas = Object.keys(seleccion).filter((k) => (seleccion[k]?.length ?? 0) > 0).length

  useResultados(selectedCat, query, setResultados, setLoading)
  useFacetasDeCategoria(selectedCat, setFacetas, setSeleccion)
  useFiltroDeFacetas(selectedCat, seleccion, facetasActivas, setSlugsFiltrados)

  return { resultados, loading, facetas, seleccion, marcados, slugsFiltrados, setSeleccion, setMarcados }
}

/** Resultados visibles tras el filtro de facetas activas. */
function useVisibles(estado: EstadoExplorador, selectedCat: string | null): readonly Device[] {
  const facetasActivas = Object.keys(estado.seleccion).filter((k) => (estado.seleccion[k]?.length ?? 0) > 0).length
  return React.useMemo(() => {
    if (!selectedCat || facetasActivas === 0) return estado.resultados
    return estado.resultados.filter((d) => estado.slugsFiltrados.has(d.slug.value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.resultados, selectedCat, facetasActivas, estado.slugsFiltrados])
}

/** Alterna un valor dentro del filtro de una faceta. */
function alternarValor(prev: Record<string, readonly string[]>, key: string, valor: string): Record<string, readonly string[]> {
  const actual = prev[key] ?? []
  const next = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]
  return { ...prev, [key]: next }
}

/** Alterna un slug en el conjunto de dispositivos marcados. */
function alternarSlug(prev: ReadonlySet<string>, slug: string): ReadonlySet<string> {
  const next = new Set(prev)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  return next
}