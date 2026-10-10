import React from 'react'
import { useServices, cargarFacetas, cargarResultados, filtrarPorFacetas, type FacetaUI } from './explore-piezas.js'
import type { Device } from '@netatlas/domain'

/**
 * Efectos de carga del Explorador (§10.4 / F3): resultados, facetas dinámicas
 * y filtro por facetas. Cada efecto registra el fallo con contexto y deja la
 * vista en un estado consistente (lista vacía) en vez de fallar en silencio.
 */

/** Resultados de la categoría seleccionada o de la consulta DSL. */
export function useResultados(
  selectedCat: string | null,
  query: string,
  setResultados: (d: readonly Device[]) => void,
  setLoading: (v: boolean) => void,
): void {
  React.useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const svc = useServices.getState().services
        setResultados(await cargarResultados(svc, selectedCat, query))
      } catch (error) {
        // Best-effort explícito: sin resultados la vista muestra el estado vacío.
        console.error('[ERROR] no se pudieron cargar los resultados del explorador', { selectedCat, query, error })
        setResultados([])
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat, query])
}

/** Facetas dinámicas de la categoría (F3); sin categoría no hay facetas. */
export function useFacetasDeCategoria(
  selectedCat: string | null,
  setFacetas: (f: readonly FacetaUI[]) => void,
  setSeleccion: (s: Record<string, readonly string[]>) => void,
): void {
  React.useEffect(() => {
    setSeleccion({})
    if (!selectedCat) {
      setFacetas([])
      return
    }
    void (async () => {
      try {
        const svc = useServices.getState().services
        setFacetas(await cargarFacetas(svc, selectedCat))
      } catch (error) {
        // Best-effort explícito: sin facetas la categoría sigue navegable.
        console.warn('[WARN] facetas del explorador no disponibles', { selectedCat, error })
        setFacetas([])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat])
}

/** Aplica el filtro de facetas activas sobre los resultados de la categoría. */
export function useFiltroDeFacetas(
  selectedCat: string | null,
  seleccion: Record<string, readonly string[]>,
  facetasActivas: number,
  setSlugsFiltrados: (s: ReadonlySet<string>) => void,
): void {
  React.useEffect(() => {
    if (!selectedCat || facetasActivas === 0) {
      setSlugsFiltrados(new Set())
      return
    }
    void (async () => {
      try {
        const svc = useServices.getState().services
        setSlugsFiltrados(await filtrarPorFacetas(svc, selectedCat, seleccion))
      } catch (error) {
        // Best-effort explícito: sin filtro se muestran los resultados completos.
        console.warn('[WARN] filtro por facetas no disponible', { selectedCat, error })
        setSlugsFiltrados(new Set())
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat, seleccion, facetasActivas])
}