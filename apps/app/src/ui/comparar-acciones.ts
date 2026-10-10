import { generarPdfComparacion } from './comparar-piezas.js'
import type { ComparisonReport } from './comparar-piezas.js'

/**
 * Acciones del comparador (F5 / §18): alternar filas plegadas, exportar el PDF
 * del informe y copiar el enlace compartible. Fuera del hook para que cada
 * función tenga una sola responsabilidad.
 */

/** Alterna un elemento en un conjunto inmutable. */
export function alternar(prev: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(prev)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/** Exporta el PDF del informe; si jsPDF falla, imprime la vista. */
export async function exportarPdf(report: ComparisonReport | null): Promise<void> {
  if (!report) return
  try {
    // Descarga directa con jsPDF (NET-HW-042, deuda F5 resuelta).
    await generarPdfComparacion(report)
  } catch (error) {
    // Best-effort explícito: si jsPDF no puede generar, se imprime la vista.
    console.warn('[WARN] PDF de comparación falló; se usa la impresión del navegador', { error })
    imprimirVista()
  }
}

/** Impresión del navegador como salida de respaldo. */
function imprimirVista(): void {
  try {
    window.print()
  } catch (errorImpresion) {
    // Best-effort explícito: sin soporte de impresión (jsdom) no hay más salida.
    console.warn('[WARN] la impresión del navegador no está disponible', { error: errorImpresion })
  }
}

/**
 * Copia el enlace compartible con la etiqueta del veredicto en `v=`; el aviso
 * de «copiado» solo aparece si la escritura al portapapeles tuvo éxito.
 */
export async function copiarEnlace(
  report: ComparisonReport | null,
  etiquetaReporte: string | undefined,
  slugs: readonly string[],
  setEnlaceCopiado: (v: boolean) => void,
): Promise<void> {
  if (!report || !etiquetaReporte) return
  const url = new URL(window.location.href)
  url.searchParams.set('ids', slugs.join(','))
  url.searchParams.set('v', etiquetaReporte)
  try {
    if (!navigator.clipboard) throw new Error('portapapeles no disponible')
    await navigator.clipboard.writeText(url.toString())
  } catch (error) {
    // Best-effort explícito: sin portapapeles (jsdom) el enlace queda visible en la URL.
    console.warn('[WARN] no se pudo copiar el enlace de comparación', { error })
    return
  }
  setEnlaceCopiado(true)
  window.setTimeout(() => setEnlaceCopiado(false), 2000)
}