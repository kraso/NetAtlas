import type { SqliteDriver, SqlRow } from '../driver.js'
import { graphNodeId } from '@netatlas/domain'
import type { GraphNode, GraphRepository, NeighborsQuery, Path, Relationship } from '@netatlas/domain'
import { SqlSlugResolver } from './graph-resolve.js'
import { dedup, peerDe, rowToRelationship } from './graph-mapeo.js'

/**
 * Adaptador SQLite del puerto GraphRepository (NET-HW-003 / §9.5).
 *
 * La tabla `relationship` es genérica: (subject_type, subject_id, predicate,
 * object_type, object_id) con ids INTEGER resueltos por tabla catálogo
 * (`graph-resolve.ts`) y normalizados a aristas del dominio (`graph-mapeo.ts`).
 *
 * Convención del plan maestro (§8.3.2):
 *  - Aristas salientes: (nodo === sujeto) → se leen tal cual.
 *  - Aristas entrantes: (nodo === objeto) → se invierten y el predicado pasa a
 *    su inverso (COALESCE(inverse_code, code)); así cat-2960x (objeto de
 *    "succeeds") se expone como "precedes cat-2960".
 *  - Predicados simétricos (compatible-with, similar-to) se almacenan una vez;
 *    la consulta bidireccional los devuelve con su mismo código.
 */

/** Estado de una búsqueda de caminos (BFS acíclico con tope de resultados). */
interface PasoCamino {
  readonly nodo: GraphNode
  readonly nodos: readonly GraphNode[]
  readonly aristas: readonly Relationship[]
}

export class SqliteGraphRepository implements GraphRepository {
  private readonly resolver: SqlSlugResolver

  constructor(private readonly db: SqliteDriver) {
    this.resolver = new SqlSlugResolver(db)
  }

  /**
   * Devuelve todas las aristas incidentes a un nodo, normalizadas:
   * salientes como están; entrantes invertidas con predicado inverso.
   */
  async edgesOf(node: GraphNode): Promise<readonly Relationship[]> {
    const id = this.resolver.idDe(node)
    if (id === undefined) return []

    const salientes = this.db
      .prepare('SELECT * FROM relationship WHERE subject_type = ? AND subject_id = ? ORDER BY predicate')
      .all(node.type, id) as SqlRow[]
    const entrantes = this.db
      .prepare('SELECT * FROM relationship WHERE object_type = ? AND object_id = ? ORDER BY predicate')
      .all(node.type, id) as SqlRow[]

    const out: Relationship[] = []
    for (const row of salientes) out.push(rowToRelationship(row, this.resolver, false))
    for (const row of entrantes) out.push(rowToRelationship(row, this.resolver, true))
    return out
  }

  /** Vecindad a profundidad N por BFS sobre aristas indexadas (§9.5). */
  async neighbors(query: NeighborsQuery): Promise<readonly Relationship[]> {
    if (this.resolver.idDe(query.node) === undefined) return []

    const visitado = new Set<string>([claveNodo(query.node)])
    const frontier: GraphNode[] = [query.node]
    const acumulado: Relationship[] = []

    for (let depth = 0; depth < query.maxDepth && frontier.length > 0; depth++) {
      const nivel = await this.aristasDeNivel(frontier, query, visitado, depth)
      acumulado.push(...nivel.aristas)
      frontier.length = 0
      frontier.push(...nivel.siguientes)
    }
    return dedup(acumulado)
  }

  /** Aristas de un nivel de BFS + los vecinos aún no visitados del siguiente. */
  private async aristasDeNivel(
    frontier: readonly GraphNode[],
    query: NeighborsQuery,
    visitado: Set<string>,
    depth: number,
  ): Promise<{ aristas: Relationship[]; siguientes: GraphNode[] }> {
    const aristas: Relationship[] = []
    const siguientes: GraphNode[] = []
    for (const nodo of frontier) {
      for (const arista of await this.edgesOf(nodo)) {
        if (query.predicates && !query.predicates.includes(arista.predicate)) continue
        aristas.push(arista)
        const peer = peerDe(arista, nodo)
        if (visitado.has(claveNodo(peer))) continue
        visitado.add(claveNodo(peer))
        if (depth < query.maxDepth - 1) siguientes.push(peer)
      }
    }
    return { aristas, siguientes }
  }

  /** Caminos entre dos nodos con profundidad máxima (BFS acíclico). */
  async paths(from: GraphNode, to: GraphNode, maxDepth: number): Promise<readonly Path[]> {
    if (this.resolver.idDe(from) === undefined || this.resolver.idDe(to) === undefined || maxDepth < 1) return []

    const results: Path[] = []
    const cola: PasoCamino[] = [{ nodo: from, nodos: [from], aristas: [] }]
    const visitado = new Set<string>([claveNodo(from)])

    while (cola.length > 0 && results.length < 20) {
      const actual = cola.shift()!
      if (actual.nodo.type === to.type && actual.nodo.slug === to.slug) {
        results.push({ nodes: [...actual.nodos], edges: [...actual.aristas] })
        continue
      }
      if (actual.nodos.length <= maxDepth) await this.extenderCamino(actual, cola, visitado)
    }
    return results
  }

  /** Añade a la cola los vecinos no visitados de un paso del BFS de caminos. */
  private async extenderCamino(paso: PasoCamino, cola: PasoCamino[], visitado: Set<string>): Promise<void> {
    for (const arista of await this.edgesOf(paso.nodo)) {
      const peer = peerDe(arista, paso.nodo)
      const key = claveNodo(peer)
      if (visitado.has(key)) continue
      visitado.add(key)
      cola.push({ nodo: peer, nodos: [...paso.nodos, peer], aristas: [...paso.aristas, arista] })
    }
  }

  /**
   * Vecindad por CTE recursiva (NET-HW-029) — profundidad N dentro de un mismo
   * tipo de entidad (p. ej. device→device). La CTE materializa los ids
   * alcanzables en ≤ maxDepth saltos con deduplicación de paquetes; el caller
   * resuelve slugs después. Más eficiente que BFS-JS para subgrafos densos.
   */
  async vecindadCte(node: GraphNode, maxDepth: number, predicates?: readonly string[]): Promise<readonly number[]> {
    const start = this.resolver.idDe(node)
    if (start === undefined || maxDepth < 1) return []

    const rows = this.db
      .prepare(consultaVecindadRecursiva(predicates))
      .all(start, node.type, ...(predicates ?? []), maxDepth) as SqlRow[]

    return rows.filter((r) => String(r.tipo) === node.type).map((r) => Number(r.id))
  }
}

/** Clave de deduplicación de un nodo (tipo + slug). */
function claveNodo(node: GraphNode): string {
  return `${node.type}:${node.slug}`
}

/** CTE recursiva de vecindad con filtro opcional de predicados. */
function consultaVecindadRecursiva(predicates?: readonly string[]): string {
  const predFilter =
    predicates && predicates.length > 0
      ? `AND r.predicate IN (${predicates.map(() => '?').join(',')})`
      : ''
  return `WITH RECURSIVE alcanzable(id, tipo, profundidad) AS (
           SELECT ?, ?, 0
           UNION
           SELECT
             CASE WHEN r.subject_type = a.tipo AND r.subject_id = a.id THEN r.object_id
                  ELSE r.subject_id END,
             CASE WHEN r.subject_type = a.tipo AND r.subject_id = a.id THEN r.object_type
                  ELSE r.subject_type END,
             a.profundidad + 1
           FROM relationship r
           JOIN alcanzable a ON (
             (r.subject_type = a.tipo AND r.subject_id = a.id)
             OR (r.object_type = a.tipo AND r.object_id = a.id)
           )
           ${predFilter}
           WHERE a.profundidad < ?
         )
         SELECT DISTINCT id, tipo, profundidad FROM alcanzable`
}

// Re-export para consumidores del puerto (composition root y casos de uso).
export { graphNodeId }
export type { GraphNode, Path }
