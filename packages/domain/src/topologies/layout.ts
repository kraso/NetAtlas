/**
 * Layouts de topología (F4 refinamiento): cómputo determinista de posiciones
 * EN EL DOMINIO para que el Web Worker y el hilo principal compartan la misma
 * función (sin duplicar lógica). El worker evita bloquear el hilo de la UI en
 * topologías grandes; el fallback síncrono usa exactamente el mismo código.
 */

export interface NodoLayoutInput {
  readonly id: string
  readonly layerHint?: number | undefined
}

export interface PosicionLayout {
  readonly id: string
  readonly x: number
  readonly y: number
}

/**
 * Layout en cuadrícula por capa OSI (determinista): cada capa ocupa una fila
 * (y = capa * separación) y los nodos de esa capa se reparten en columnas.
 * Estable para el mismo input → resultados reproducibles y testeables.
 */
export function layoutPorCapas(
  nodos: readonly NodoLayoutInput[],
  opts?: { readonly separacionX?: number; readonly separacionY?: number },
): readonly PosicionLayout[] {
  const sx = opts?.separacionX ?? 90
  const sy = opts?.separacionY ?? 130

  const porCapa = new Map<number, string[]>()
  for (const n of nodos) {
    const capa = n.layerHint ?? 1
    const lista = porCapa.get(capa) ?? []
    lista.push(n.id)
    porCapa.set(capa, lista)
  }

  const capas = [...porCapa.keys()].sort((a, b) => a - b)
  const posiciones: PosicionLayout[] = []
  for (const capa of capas) {
    const ids = porCapa.get(capa)!
    const n = ids.length
    ids.forEach((id, i) => {
      // Centrado horizontal: columnas alrededor de 0.
      const x = Math.round((i - (n - 1) / 2) * sx)
      const y = Math.round((capa - 1) * sy)
      posiciones.push({ id, x, y })
    })
  }
  return posiciones
}

/**
 * Layout radial simple (círculo): útil para nodos sin capa (o como alternativa
 * al de capas). Determinista: ángulo = 2π·i/n.
 */
export function layoutRadial(
  nodos: readonly NodoLayoutInput[],
  radio = 220,
): readonly PosicionLayout[] {
  const n = Math.max(1, nodos.length)
  return nodos.map((nodo, i) => {
    const ang = (2 * Math.PI * i) / n
    return {
      id: nodo.id,
      x: Math.round(Math.cos(ang) * radio),
      y: Math.round(Math.sin(ang) * radio),
    }
  })
}

export type NombreLayout = 'capas' | 'radial'

export function aplicarLayout(
  nombre: NombreLayout,
  nodos: readonly NodoLayoutInput[],
): readonly PosicionLayout[] {
  return nombre === 'radial' ? layoutRadial(nodos) : layoutPorCapas(nodos)
}