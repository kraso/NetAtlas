/**
 * Caso de uso: Construcción del mapa global agregado (NET-HW-036).
 *
 * Orquesta el puerto `GraphRepository` para producir el mapa global agregado
 * por categoría (§13.3, NET-HW-036): nodos = categorías con conteo de
 * dispositivos; aristas = puentes category→category con peso (n enlaces).
 *
 * La agregación SQL con GROUP BY vive en el adaptador SQLite (mapaGlobal).
 * Aquí se proyecta el resultado ya agregado a formato UI directamente,
 * sin pasar por Relationship (el predicado "enlaces entre categorías" es
 * meramente visual).
 */
import type { UiGraphSubgraph, UiGraphNode, UiGraphEdge } from '../projections/subgraph.js'

export interface GlobalMapNode {
  readonly id: string
  readonly type: string
  readonly label: string
}

export interface GlobalMapEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly predicate: string
}

export interface GlobalMapInput {
  readonly nodes: readonly GlobalMapNode[]
  readonly edges: readonly GlobalMapEdge[]
}

export type BuildGlobalGraphOutput = UiGraphSubgraph

/**
 * Proyecta un mapa global ya agregado (nodos categoría + aristas category→category)
 * al formato UiGraphSubgraph. El caller (adaptador) realiza la agregación.
 */
export function buildGlobalGraph(input: GlobalMapInput): BuildGlobalGraphOutput {
  const uiNodes: UiGraphNode[] = input.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    label: n.label,
  }))

  const predicateCounts = new Map<string, number>()
  const uiEdges: UiGraphEdge[] = input.edges.map((e) => {
    const m = e.predicate.match(/^(\d+) enlace/)
    const count = m ? Number(m[1]) : 0
    predicateCounts.set(e.predicate, (predicateCounts.get(e.predicate) ?? 0) + 1)
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      predicate: e.predicate,
    }
  })

  return {
    nodes: uiNodes,
    edges: uiEdges,
    predicates: [...predicateCounts.entries()].map(([code, count]) => ({ code, count })),
  }
}
