import type { SqlRow } from '../driver.js'
import { Relationship, requirePredicate } from '@netatlas/domain'
import type { GraphNode } from '@netatlas/domain'
import type { SqlSlugResolver } from './graph-resolve.js'

/**
 * Mapeo de filas de `relationship` a aristas del dominio (NET-HW-003 / §8.3.2):
 * las entrantes se invierten y el predicado pasa a su inverso
 * (COALESCE(inverse_code, code)); los simétricos conservan su código.
 */

/** Convierte una fila a Relationship del dominio; invertida = entrante. */
export function rowToRelationship(
  row: SqlRow,
  resolver: SqlSlugResolver,
  invertida: boolean,
): Relationship {
  const spec = requirePredicate(String(row.predicate))
  const subject: GraphNode = {
    type: String(row.subject_type) as GraphNode['type'],
    slug: resolver.slugDe(String(row.subject_type) as GraphNode['type'], Number(row.subject_id)) ?? `#${row.subject_id}`,
  }
  const object: GraphNode = {
    type: String(row.object_type) as GraphNode['type'],
    slug: resolver.slugDe(String(row.object_type) as GraphNode['type'], Number(row.object_id)) ?? `#${row.object_id}`,
  }
  const comunes = {
    weight: row.weight !== null ? Number(row.weight) : undefined,
    validFrom: String(row.valid_from),
    validTo: row.valid_to !== null ? String(row.valid_to) : undefined,
  }
  if (!invertida) return Relationship.create({ subject, predicate: spec.code, object, ...comunes })
  return Relationship.create({ subject: object, predicate: spec.inverseCode ?? spec.code, object: subject, ...comunes })
}

/** Elimina aristas repetidas (mismo sujeto, predicado y objeto). */
export function dedup(rels: readonly Relationship[]): Relationship[] {
  const unicos = new Map<string, Relationship>()
  for (const r of rels) {
    const k = `${r.subject.type}:${r.subject.slug}|${r.predicate}|${r.object.type}:${r.object.slug}`
    if (!unicos.has(k)) unicos.set(k, r)
  }
  return [...unicos.values()]
}

/** Nodo que no es el de partida de una arista (el par en la vecindad). */
export function peerDe(arista: Relationship, nodo: GraphNode): GraphNode {
  return arista.subject.slug === nodo.slug && arista.subject.type === nodo.type ? arista.object : arista.subject
}
