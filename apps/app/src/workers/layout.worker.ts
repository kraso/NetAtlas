/**
 * Web Worker de layouts (F4 refinamiento): calcula posiciones de topologías
 * fuera del hilo principal. Recibe nodos con layerHint y devuelve posiciones
 * deterministas del dominio (`layoutPorCapas`). El hilo principal nunca se
 * bloquea aunque la topología tenga miles de nodos.
 */
import { layoutPorCapas } from '@netatlas/domain'
import type { NodoLayoutInput, PosicionLayout } from '@netatlas/domain'

export interface LayoutWorkerRequest {
  readonly nodos: readonly NodoLayoutInput[]
  readonly separacionX?: number
  readonly separacionY?: number
}

export interface LayoutWorkerResponse {
  readonly ok: boolean
  readonly posiciones?: readonly PosicionLayout[]
  readonly error?: string
}

self.onmessage = (evento: MessageEvent<LayoutWorkerRequest>) => {
  try {
    const { nodos, separacionX, separacionY } = evento.data
    const posiciones = layoutPorCapas(nodos, { separacionX, separacionY })
    const respuesta: LayoutWorkerResponse = { ok: true, posiciones }
    self.postMessage(respuesta)
  } catch (err) {
    const respuesta: LayoutWorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(respuesta)
  }
}