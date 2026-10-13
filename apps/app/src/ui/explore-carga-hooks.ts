import React from 'react'
import { useServices, cargarFacetas, cargarResultados, filtrarPorFacetas, type FacetaUI } from './explore-piezas.js'
import type { Device } from '@netatlas/domain'

/**
 * Efectos de carga del Explorador (§10.4 / F3): resultados, facetas dinámicas
 * y filtro por facetas. Cada efecto registra el fallo con contexto y deja la
 * vista en un estado consistente (lista vacía) en vez de fallar en silencio.
 *
 * Los tres efectos observan el objeto de servicios, no solo lo leen al vuelo:
 * cuando el dataset cambia (el remoto sustituye al demo) vuelven a cargar en vez
 * de dejar en pantalla los resultados del dataset anterior.
 */

/** Resultados de la categoría seleccionada o de la consulta DSL. */
export function useResultados(
  selectedCat: string | null,
  query: string,
  setResultados: (d: readonly Device[]) => void,
  setLoading: (v: boolean) => void,
  setError: (e: string | undefined) => void,
): void {
  const services = useServices((s) => s.services)
  React.useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(undefined)
      try {
        setResultados(await cargarResultados(services, selectedCat, query))
      } catch (error) {
        // El fallo se registra con contexto y se publica: sin esto la vista
        // mostraba «Sin resultados», que es una conclusión que no le consta.
        console.error('[ERROR] no se pudieron cargar los resultados del explorador', { selectedCat, query, error })
        setResultados([])
        setError('No se pudieron cargar los resultados. Vuelve a intentarlo.')
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedCat, query, services, setError])
}

/** Facetas dinámicas de la categoría (F3); sin categoría no hay facetas. */
export function useFacetasDeCategoria(
  selectedCat: string | null,
  setFacetas: (f: readonly FacetaUI[]) => void,
  setSeleccion: (s: Record<string, readonly string[]>) => void,
): void {
  const services = useServices((s) => s.services)
  React.useEffect(() => {
    setSeleccion({})
    if (!selectedCat) {
      setFacetas([])
      return
    }
    void (async () => {
      try {
        setFacetas(await cargarFacetas(services, selectedCat))
      } catch (error) {
        // Best-effort explícito: sin facetas la categoría sigue navegable.
        console.warn('[WARN] facetas del explorador no disponibles', { selectedCat, error })
        setFacetas([])
      }
    })()
  }, [selectedCat, services])
}

/** Aplica el filtro de facetas activas sobre los resultados de la categoría. */
export function useFiltroDeFacetas(
  selectedCat: string | null,
  seleccion: Record<string, readonly string[]>,
  facetasActivas: number,
  setSlugsFiltrados: (s: ReadonlySet<string>) => void,
): void {
  const services = useServices((s) => s.services)
  React.useEffect(() => {
    if (!selectedCat || facetasActivas === 0) {
      setSlugsFiltrados(new Set())
      return
    }
    void (async () => {
      try {
        setSlugsFiltrados(await filtrarPorFacetas(services, selectedCat, seleccion))
      } catch (error) {
        // Best-effort explícito: sin filtro se muestran los resultados completos.
        console.warn('[WARN] filtro por facetas no disponible', { selectedCat, error })
        setSlugsFiltrados(new Set())
      }
    })()
  }, [selectedCat, seleccion, facetasActivas, services])
}
