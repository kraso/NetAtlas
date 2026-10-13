/**
 * Caso de uso: Construcción del subgrafo local (NET-HW-030).
 *
 * Orquesta el puerto `GraphRepository.neighbors` (del dominio) y la proyección
 * `buildSubgraph` para devolver el subgrafo UI (nodos, aristas, predicados) que
 * consume el mapa interactivo.
 *
 * El BFS/CTE recursiva vive en el adaptador (packages/data SQLite / in-memory);
 * aquí sólo se proyecta el resultado relacional del dominio a la vista.
 */
import type { GraphRepository, GraphNode } from '@netatlas/domain'
import { buildSubgraph, dedup } from '../projections/subgraph.js'
import type { UiGraphSubgraph } from '../projections/subgraph.js'

export interface BuildLocalGraphInput {
  readonly node: GraphNode
  readonly maxDepth: number
  readonly predicates?: readonly string[]
}

export type BuildLocalGraphOutput = UiGraphSubgraph

/**
 * Construye el subgrafo local alrededor de un nodo.
 * Orquesta: GraphRepository.neighbors() → buildSubgraph().
 */
export async function buildLocalGraph(
  ports: { graph: GraphRepository },
  input: BuildLocalGraphInput,
): Promise<BuildLocalGraphOutput> {
  const aristas = await ports.graph.neighbors({
    node: input.node,
    maxDepth: input.maxDepth,
    predicates: input.predicates,
  })
  return buildSubgraph(dedup(aristas))
}
