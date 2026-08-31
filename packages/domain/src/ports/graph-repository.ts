import type { Relationship, GraphNode } from '../graph/graph.js'

export interface NeighborsQuery {
  readonly node: GraphNode
  readonly predicates?: readonly string[] | undefined
  readonly maxDepth: number
}

export interface Path {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly Relationship[]
}

/**
 * Puerto GraphRepository (sección 6.6 / 9.5).
 * Vecindad y caminos acotados (2–3 saltos) resueltos con CTE recursiva.
 */
export interface GraphRepository {
  neighbors(query: NeighborsQuery): Promise<readonly Relationship[]>
  /** Caminos entre dos nodos con profundidad máxima (ciclos evitados). */
  paths(from: GraphNode, to: GraphNode, maxDepth: number): Promise<readonly Path[]>
  edgesOf(node: GraphNode): Promise<readonly Relationship[]>
}