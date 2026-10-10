import type { UiGraphSubgraph } from '../adapters/in-memory-tipos.js'
import type { CyElement } from './cytoscape-canvas.js'

/**
 * Lógica del mapa global (NET-HW-036, §13.2): orden de los nodos por tamaño,
 * posiciones en anillos ordenados y construcción de los elements de Cytoscape.
 * Determinista: el mismo dataset siempre produce el mismo mapa.
 */

type Posicion = { x: number; y: number }

const CENTRO: Posicion = { x: 350, y: 230 }
const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5))

/** Nodos del subgrafo ordenados por conteo de dispositivos (mayor al centro). */
export function nodosOrdenados(subgrafo: UiGraphSubgraph): UiGraphSubgraph['nodes'] {
  return [...subgrafo.nodes].sort((a, b) => conteoDe(b.label) - conteoDe(a.label))
}

/** Elements de Cytoscape con posiciones iniciales en anillos ordenados. */
export function elementsDelMapa(subgrafo: UiGraphSubgraph | undefined): readonly CyElement[] {
  const nodos = subgrafo ? nodosOrdenados(subgrafo) : []
  const posiciones = calcularAnillos(nodos, 0)
  const aristas = subgrafo?.edges.map((e) => ({
    data: { id: e.id, source: e.source, target: e.target, label: e.predicate },
  }))
  return [
    ...nodos.map((n) => ({ data: { id: n.id, label: n.label, tipo: n.type }, position: posiciones.get(n.id) })),
    ...(aristas ?? []),
  ]
}

/** Posiciones del reordenado: cada variante gira los anillos (ángulo aureo). */
export function posicionesDeVariante(subgrafo: UiGraphSubgraph, variante: number): Map<string, Posicion> {
  return calcularAnillos(nodosOrdenados(subgrafo), variante)
}

/**
 * Anillos ordenados por tamaño (variante N): la categoría mayor al centro y el
 * resto en dos anillos. Cada variante gira los anillos con ángulo aureo y
 * alterna el sentido, así Reordenar siempre produce una disposición distinta.
 */
function calcularAnillos(nodos: ReadonlyArray<{ readonly id: string }>, variante: number): Map<string, Posicion> {
  const giro = variante * ANGULO_AUREO
  const sentido = variante % 2 === 0 ? 1 : -1
  const posiciones = new Map<string, Posicion>()
  nodos.forEach((n, i) => {
    if (i === 0) posiciones.set(n.id, CENTRO)
    else posiciones.set(n.id, puntoDeAnillo(i, nodos.length, giro, sentido))
  })
  return posiciones
}

/** Punto del anillo 1 (≤8 nodos) o 2 para la posición i-ésima del mapa. */
function puntoDeAnillo(i: number, totalNodos: number, giro: number, sentido: number): Posicion {
  const anillo = i <= 8 ? 1 : 2
  const radio = anillo === 1 ? 150 : 265
  const k = anillo === 1 ? i - 1 : i - 9
  const total = anillo === 1 ? Math.min(totalNodos - 1, 8) : totalNodos - 9
  const ang = sentido * ((2 * Math.PI * k) / Math.max(total, 1)) - Math.PI / 2 + giro
  return { x: CENTRO.x + radio * Math.cos(ang), y: CENTRO.y + radio * Math.sin(ang) * 0.72 }
}

/** Extrae el conteo final «(42)» de la etiqueta para ordenar nodos por tamaño. */
export function conteoDe(label: string): number {
  const m = /\((\d+)\)\s*$/.exec(label)
  return m ? Number(m[1]!) : 0
}

/** Separa «Nombre (42)» en [Nombre, 42]. */
export function separarConteo(label: string): [string, string] {
  const m = /^(.*)\s+\((\d+)\)$/.exec(label)
  return m ? [m[1]!, m[2]!] : [label, '—']
}
