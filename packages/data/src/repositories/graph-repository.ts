import type { SqliteDriver, SqlRow } from '../driver.js'
import { Relationship, graphNodeId, requirePredicate } from '@netatlas/domain'
import type { GraphNode, GraphRepository, NeighborsQuery, Path } from '@netatlas/domain'

/**
 * Adaptador SQLite del puerto GraphRepository (NET-HW-003 / §9.5).
 *
 * La tabla `relationship` es genérica: (subject_type, subject_id, predicate,
 * object_type, object_id) con ids INTEGER resueltos por tabla catálogo.
 *
 * Convención del plan maestro (§8.3.2):
 *  - Aristas salientes: (nodo === sujeto) → se leen tal cual.
 *  - Aristas entrantes: (nodo === objeto) → se invierten y el predicado pasa a
 *    su inverso (COALESCE(inverse_code, code)); así cat-2960x (objeto de
 *    "succeeds") se expone como "precedes cat-2960".
 *  - Predicados simétricos (compatible-with, similar-to) se almacenan una vez;
 *    la consulta bidireccional los devuelve con su mismo código.
 */

const RESOLVE_SQL: Record<string, { table: string; slugCol: string; idCol?: string }> = {
  device: { table: 'device', slugCol: 'slug' },
  manufacturer: { table: 'manufacturer', slugCol: 'slug' },
  'product-family': { table: 'product_family', slugCol: 'slug' },
  category: { table: 'category', slugCol: 'code' },
  interface: { table: 'interface', slugCol: 'code' },
  protocol: { table: 'protocol', slugCol: 'code' },
  // standard no tiene columna code: el slug canónico es "org/identifier"
  // (misma convención que suggestGrouped, StandardSheet y snapshotDetail).
  standard: { table: 'standard', slugCol: "org || '/' || identifier" },
  technology: { table: 'technology', slugCol: 'slug' },
  medium: { table: 'medium', slugCol: 'code' },
  component: { table: 'component', slugCol: 'model' },
  layer: { table: 'osi_layer', slugCol: 'number', idCol: 'number' },
  firmware: { table: 'firmware', slugCol: 'version', idCol: 'id' },
  topology: { table: 'topology', slugCol: 'slug' },
  'speed-grade': { table: 'speed_grade', slugCol: 'code' },
}

export class SqliteGraphRepository implements GraphRepository {
  constructor(private readonly db: SqliteDriver) {}

  private resolveId(node: GraphNode): number | undefined {
    const def = RESOLVE_SQL[node.type]
    if (!def) return undefined
    const row = this.db
      .prepare(`SELECT ${def.idCol ?? 'id'} AS id FROM ${def.table} WHERE ${def.slugCol} = ?`)
      .get(node.slug) as { id: number } | undefined
    return row ? Number(row.id) : undefined
  }

  private slugById(type: GraphNode['type'], id: number): string | undefined {
    const def = RESOLVE_SQL[type]
    if (!def) return undefined
    const row = this.db
      .prepare(`SELECT ${def.slugCol} AS slug FROM ${def.table} WHERE ${def.idCol ?? 'id'} = ?`)
      .get(id) as { slug: string | number } | undefined
    return row ? String(row.slug) : undefined
  }

  /**
   * Devuelve todas las aristas incidentes a un nodo, normalizadas:
   * salientes como están; entrantes invertidas con predicado inverso.
   */
  async edgesOf(node: GraphNode): Promise<readonly Relationship[]> {
    const id = this.resolveId(node)
    if (id === undefined) return []

    const salientes = this.db
      .prepare('SELECT * FROM relationship WHERE subject_type = ? AND subject_id = ? ORDER BY predicate')
      .all(node.type, id) as SqlRow[]
    const entrantes = this.db
      .prepare('SELECT * FROM relationship WHERE object_type = ? AND object_id = ? ORDER BY predicate')
      .all(node.type, id) as SqlRow[]

    const out: Relationship[] = []
    for (const row of salientes) out.push(this.rowToRelationship(row, false))
    for (const row of entrantes) out.push(this.rowToRelationship(row, true))
    return out
  }

  /** Vecindad a profundidad N por BFS sobre aristas indexadas (§9.5). */
  async neighbors(query: NeighborsQuery): Promise<readonly Relationship[]> {
    const start = this.resolveId(query.node)
    if (start === undefined) return []

    const visitado = new Set<string>(`${query.node.type}:${start}`)
    const frontier: GraphNode[] = [query.node]
    const acumulado: Relationship[] = []

    for (let depth = 0; depth < query.maxDepth && frontier.length > 0; depth++) {
      const actual = [...frontier]
      frontier.length = 0
      const resultadosNivel: Relationship[] = []
      for (const nodo of actual) {
        const aristas = await this.edgesOf(nodo)
        for (const arista of aristas) {
          if (query.predicates && !query.predicates.includes(arista.predicate)) continue
          resultadosNivel.push(arista)
          const peer = arista.subject.slug === nodo.slug && arista.subject.type === nodo.type ? arista.object : arista.subject
          const key = `${peer.type}:${peer.slug}`
          if (visitado.has(key)) continue
          visitado.add(key)
          if (depth < query.maxDepth - 1) frontier.push(peer)
        }
      }
      acumulado.push(...resultadosNivel)
    }
    return dedup(acumulado)
  }

  /** Caminos entre dos nodos con profundidad máxima (BFS acíclico). */
  async paths(from: GraphNode, to: GraphNode, maxDepth: number): Promise<readonly Path[]> {
    const fromId = this.resolveId(from)
    const toId = this.resolveId(to)
    if (fromId === undefined || toId === undefined || maxDepth < 1) return []

    const results: Path[] = []
    const cola: { nodo: GraphNode; nodos: GraphNode[]; aristas: Relationship[] }[] = [
      { nodo: from, nodos: [from], aristas: [] },
    ]
    const visitado = new Set<string>(`${from.type}:${fromId}`)

    while (cola.length > 0 && results.length < 20) {
      const actual = cola.shift()!
      if (actual.nodo.type === to.type && actual.nodo.slug === to.slug) {
        results.push({ nodes: actual.nodos, edges: actual.aristas })
        continue
      }
      if (actual.nodos.length > maxDepth) continue

      const aristas = await this.edgesOf(actual.nodo)
      for (const arista of aristas) {
        const peer = arista.subject.type === actual.nodo.type && arista.subject.slug === actual.nodo.slug ? arista.object : arista.subject
        const key = `${peer.type}:${peer.slug}`
        if (visitado.has(key)) continue
        visitado.add(key)
        cola.push({
          nodo: peer,
          nodos: [...actual.nodos, peer],
          aristas: [...actual.aristas, arista],
        })
      }
    }
    return results
  }

  /**
   * Vecindad por CTE recursiva (NET-HW-029) — profundidad N dentro de un mismo
   * tipo de entidad (p. ej. device→device). La CTE materializa los ids
   * alcanzables en ≤ maxDepth saltos con deduplicación de paquetes; el caller
   * resuelve slugs después. Más eficiente que BFS-JS para subgrafos densos.
   */
  async vecindadCte(node: GraphNode, maxDepth: number, predicates?: readonly string[]): Promise<readonly number[]> {
    const start = this.resolveId(node)
    if (start === undefined || maxDepth < 1) return []

    const predFilter =
      predicates && predicates.length > 0
        ? `AND r.predicate IN (${predicates.map(() => '?').join(',')})`
        : ''

    const rows = this.db
      .prepare(
        `WITH RECURSIVE alcanzable(id, tipo, profundidad) AS (
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
         SELECT DISTINCT id, tipo, profundidad FROM alcanzable`,
      )
      .all(
        start,
        node.type,
        ...(predicates ?? []),
        maxDepth,
      ) as SqlRow[]

    return rows.filter((r) => String(r.tipo) === node.type).map((r) => Number(r.id))
  }

  /** Convierte una fila a Relationship del dominio; invertida = entrante. */
  private rowToRelationship(row: SqlRow, invertida: boolean): Relationship {
    const spec = requirePredicate(String(row.predicate))
    const subjectType = String(row.subject_type) as GraphNode['type']
    const objectType = String(row.object_type) as GraphNode['type']
    const subject: GraphNode = {
      type: subjectType,
      slug: this.slugById(subjectType, Number(row.subject_id)) ?? `#${row.subject_id}`,
    }
    const object: GraphNode = {
      type: objectType,
      slug: this.slugById(objectType, Number(row.object_id)) ?? `#${row.object_id}`,
    }

    if (!invertida) {
      return Relationship.create({
        subject,
        predicate: spec.code,
        object,
        weight: row.weight !== null ? Number(row.weight) : undefined,
        validFrom: String(row.valid_from),
        validTo: row.valid_to !== null ? String(row.valid_to) : undefined,
      })
    }

    // Entrante → invertimos; si el predicado tiene inverso, lo usamos;
    // si es simétrico, conservamos el mismo (compatible-with ↔ compatible-with).
    const code = spec.inverseCode ?? spec.code
    return Relationship.create({
      subject: object,
      predicate: code,
      object: subject,
      weight: row.weight !== null ? Number(row.weight) : undefined,
      validFrom: String(row.valid_from),
      validTo: row.valid_to !== null ? String(row.valid_to) : undefined,
    })
  }
}

function dedup(rels: readonly Relationship[]): Relationship[] {
  const unicos = new Map<string, Relationship>()
  for (const r of rels) {
    const k = `${r.subject.type}:${r.subject.slug}|${r.predicate}|${r.object.type}:${r.object.slug}`
    if (!unicos.has(k)) unicos.set(k, r)
  }
  return [...unicos.values()]
}

export { graphNodeId }
export type { GraphNode, Path }