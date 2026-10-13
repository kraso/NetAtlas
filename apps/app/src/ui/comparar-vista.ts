import React from 'react'
import { useServices } from '../composition-root.js'
import { exportarComparacionCsv, type ComparisonReport } from './comparar-piezas.js'
import { alternar, copiarEnlace, exportarPdf } from './comparar-acciones.js'
import { type DatosComparador } from './comparar-datos.js'

/**
 * Vista del comparador (F5 / §18): campos, acciones y filtros que la pantalla
 * consume, más la composición final. `comparar-hooks.ts` solo los une.
 */

export interface ComparadorVista {
  readonly slugs: readonly string[]
  readonly report: ComparisonReport | null
  readonly cargando: boolean
  readonly fallo: boolean
  readonly soloDiferencias: boolean
  readonly expandidas: ReadonlySet<string>
  readonly busqueda: string
  readonly sugerencias: readonly { slug: string; label: string }[]
  readonly etiquetaUrl: string | null
  readonly enlaceCopiado: boolean
  readonly enlaceVerificado: boolean
  readonly onBusqueda: (q: string) => void
  readonly onAñadir: (slug: string) => void
  readonly onQuitar: (slug: string) => void
  readonly onToggleSoloDiferencias: () => void
  readonly onToggleFila: (key: string) => void
  readonly onExportarCsv: () => void
  readonly onExportarPdf: () => void
  readonly onCopiarEnlace: () => void
}

/** Filtros y buscador del comparador. */
export interface FiltrosComparador {
  soloDiferencias: boolean
  expandidas: ReadonlySet<string>
  busqueda: string
  sugerencias: readonly { slug: string; label: string }[]
  setBusqueda: (q: string) => void
  setSugerencias: (s: readonly { slug: string; label: string }[]) => void
  toggleSoloDiferencias: () => void
  toggleFila: (key: string) => void
}

/** Compone la vista pública a partir de los datos y los filtros. */
export function combinar(datos: DatosComparador, filtros: FiltrosComparador): ComparadorVista {
  return { ...campos(datos, filtros), ...acciones(datos, filtros) }
}

/** Campos de solo lectura que la pantalla proyecta. */
function campos(datos: DatosComparador, filtros: FiltrosComparador): Omit<ComparadorVista, keyof AccionesComparador> {
  const { slugs, report, etiquetaUrl, etiquetaReporte } = datos
  return {
    slugs,
    report,
    cargando: datos.cargando,
    fallo: datos.fallo,
    soloDiferencias: filtros.soloDiferencias,
    expandidas: filtros.expandidas,
    busqueda: filtros.busqueda,
    sugerencias: filtros.sugerencias,
    etiquetaUrl,
    enlaceCopiado: datos.enlaceCopiado,
    enlaceVerificado: report !== null && etiquetaUrl !== null && etiquetaReporte !== undefined && etiquetaUrl === etiquetaReporte,
  }
}

/** Callbacks que la pantalla dispara. */
type AccionesComparador = Pick<
  ComparadorVista,
  'onBusqueda' | 'onAñadir' | 'onQuitar' | 'onToggleSoloDiferencias' | 'onToggleFila' | 'onExportarCsv' | 'onExportarPdf' | 'onCopiarEnlace'
>

/** Acciones de selección, filtros y exportaciones. */
function acciones(datos: DatosComparador, filtros: FiltrosComparador): AccionesComparador {
  const { slugs, report, etiquetaReporte } = datos
  return {
    onBusqueda: filtros.setBusqueda,
    onAñadir: (slug) => {
      datos.aplicarSeleccion([...slugs, slug])
      filtros.setBusqueda('')
      filtros.setSugerencias([])
    },
    onQuitar: (slug) => datos.aplicarSeleccion(slugs.filter((s) => s !== slug)),
    onToggleSoloDiferencias: filtros.toggleSoloDiferencias,
    onToggleFila: filtros.toggleFila,
    onExportarCsv: () => {
      if (report) exportarComparacionCsv(report)
    },
    onExportarPdf: () => void exportarPdf(report),
    onCopiarEnlace: () => void copiarEnlace(report, etiquetaReporte, slugs, datos.setEnlaceCopiado),
  }
}

/** Filtros de la tabla y sugerencias del buscador. */
export function useFiltrosComparador(): FiltrosComparador {
  const [soloDiferencias, setSoloDiferencias] = React.useState(false)
  const [expandidas, setExpandidas] = React.useState<ReadonlySet<string>>(new Set())
  const [busqueda, setBusqueda] = React.useState('')
  const [sugerencias, setSugerencias] = React.useState<readonly { slug: string; label: string }[]>([])
  useSugerencias(busqueda, setSugerencias)
  return {
    soloDiferencias,
    expandidas,
    busqueda,
    sugerencias,
    setBusqueda,
    setSugerencias,
    toggleSoloDiferencias: () => setSoloDiferencias((prev) => !prev),
    toggleFila: (key) => setExpandidas((prev) => alternar(prev, key)),
  }
}

/** Sugerencias del buscador de dispositivos (best-effort explícito). */
function useSugerencias(busqueda: string, setSugerencias: (s: readonly { slug: string; label: string }[]) => void): void {
  React.useEffect(() => {
    void cargarSugerencias(busqueda, setSugerencias)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])
}

/** Consulta las sugerencias; una búsqueda vacía o un fallo dejan la lista vacía. */
async function cargarSugerencias(busqueda: string, setSugerencias: (s: readonly { slug: string; label: string }[]) => void): Promise<void> {
  if (!busqueda.trim()) {
    setSugerencias([])
    return
  }
  try {
    const { search } = useServices.getState().services
    const grouped = await search.suggestGrouped(busqueda.trim(), 5)
    setSugerencias(grouped['Dispositivos'] ?? [])
  } catch (error) {
    // Best-effort explícito: sin sugerencias el buscador sigue usable.
    console.warn('[WARN] sugerencias del comparador no disponibles', { error })
    setSugerencias([])
  }
}