import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useServices } from '../composition-root.js'
import { compareDevicesUseCase, etiquetaDeReporte } from './comparar-piezas.js'
import type { ComparisonReport } from './comparar-piezas.js'

/**
 * Datos del comparador (F5 / §18): selección desde el querystring, recálculo
 * del informe con el caso de uso compartido y estado del enlace compartible.
 */

/** Slugs a comparar desde el querystring (`ids=a,b` + retrocompatibles `a`/`b`). */
export function slugsDeParams(params: URLSearchParams): string[] {
  const slugsRaw = params.get('ids') ?? ''
  const deIds = slugsRaw ? slugsRaw.split(',').map((s) => s.trim()).filter(Boolean) : []
  const deAb = [params.get('a'), params.get('b')].filter((s): s is string => Boolean(s))
  return [...new Set([...deIds, ...deAb])]
}

/** Datos del comparador: selección del querystring, informe y enlace. */
export interface DatosComparador {
  slugs: string[]
  report: ComparisonReport | null
  cargando: boolean
  fallo: boolean
  etiquetaUrl: string | null
  etiquetaReporte: string | undefined
  enlaceCopiado: boolean
  setEnlaceCopiado: (v: boolean) => void
  aplicarSeleccion: (next: readonly string[]) => void
}

/** Setters que usa el cálculo del informe. */
interface SettersInforme {
  setReport: (r: ComparisonReport | null) => void
  setCargando: (v: boolean) => void
  setFallo: (v: boolean) => void
  setEtiqueta: (t: string | undefined) => void
}

/** Selección del querystring, informe recalculado y estado del enlace. */
export function useDatosComparador(): DatosComparador {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const ports = useServices.getState().services
  const [report, setReport] = React.useState<ComparisonReport | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [fallo, setFallo] = React.useState(false)
  const [etiquetaReporte, setEtiquetaReporte] = React.useState<string | undefined>()
  const [enlaceCopiado, setEnlaceCopiado] = React.useState(false)
  const slugs = React.useMemo(() => slugsDeParams(params), [params])

  useInforme(ports, slugs, { setReport, setCargando, setFallo, setEtiqueta: setEtiquetaReporte })

  return {
    slugs,
    report,
    cargando,
    fallo,
    etiquetaUrl: params.get('v'),
    etiquetaReporte,
    enlaceCopiado,
    setEnlaceCopiado,
    aplicarSeleccion: (next) => {
      if (next.length === 0) navegar('/comparar')
      else setParams({ ids: next.join(',') }, { replace: true })
    },
  }
}

/** Recalcula el informe cuando cambia la selección de slugs. */
function useInforme(ports: Parameters<typeof compareDevicesUseCase>[0], slugs: readonly string[], setters: SettersInforme): void {
  const claveSlugs = slugs.join('|')
  React.useEffect(() => {
    setters.setCargando(true)
    setters.setFallo(false)
    void cargarInforme(ports, slugs, setters).finally(() => setters.setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSlugs])
}

/** Calcula el informe y su etiqueta; registra el fallo de cara al usuario. */
async function cargarInforme(
  ports: Parameters<typeof compareDevicesUseCase>[0],
  slugs: readonly string[],
  setters: SettersInforme,
): Promise<void> {
  try {
    const completo = await compareDevicesUseCase(ports, { slugs })
    setters.setReport(completo)
    // Etiqueta del veredicto: si el enlace trae `v=`, se verifica contra el
    // reporte recalculado (detecta cambios de datos entre generación y vista).
    setters.setEtiqueta(completo ? etiquetaDeReporte(completo).hash : undefined)
  } catch (error) {
    // Fallo de cara al usuario: se registra y la vista muestra el aviso.
    console.error('[ERROR] comparación de dispositivos falló', { slugs, error })
    setters.setReport(null)
    setters.setFallo(true)
  }
}