/**
 * Cliente del Web Worker de layouts (F4 refinamiento).
 *
 * Usa el worker real si el entorno lo soporta (navegador); en jsdom/tests cae
 * al cálculo síncrono del mismo código del dominio (`layoutPorCapas`), de modo
 * que la UI es idéntica y la suite no depende de la disponibilidad de Worker.
 */
import { layoutPorCapas } from '@netatlas/domain'
import type { NodoLayoutInput, PosicionLayout } from '@netatlas/domain'

export interface LayoutRequest {
  readonly nodos: readonly NodoLayoutInput[]
  readonly separacionX?: number
  readonly separacionY?: number
}

const soportaWorker = typeof Worker !== 'undefined'

/** Calcula posiciones de layout (worker real o fallback síncrono). */
export function calcularLayoutEnWorker(req: LayoutRequest): Promise<readonly PosicionLayout[]> {
  if (!soportaWorker) {
    return Promise.resolve(layoutPorCapas(req.nodos, { separacionX: req.separacionX, separacionY: req.separacionY }))
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
    const timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Layout worker: timeout (se usará la posición por defecto).'))
    }, 15_000)
    worker.onmessage = (evento: MessageEvent<{ ok: boolean; posiciones?: readonly PosicionLayout[]; error?: string }>) => {
      const datos = evento.data
      window.clearTimeout(timeout)
      worker.terminate()
      if (datos.ok && datos.posiciones) resolve(datos.posiciones)
      else reject(new Error(datos.error ?? 'Layout worker: respuesta sin posiciones.'))
    }
    worker.onerror = (e) => {
      window.clearTimeout(timeout)
      worker.terminate()
      reject(new Error(`Layout worker: ${e.message}`))
    }
    worker.postMessage(req)
  })
}

/** Helper: mapea ids a posiciones (para aplicar sobre la topología). */
export function posicionesPorId(
  posiciones: readonly PosicionLayout[],
): ReadonlyMap<string, { x: number; y: number }> {
  return new Map(posiciones.map((p) => [p.id, { x: p.x, y: p.y }]))
}