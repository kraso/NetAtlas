import { requirePredicate } from './graph-predicados.js'
import { graphNodeId } from './graph-tipos.js'
import type { GraphNode } from './graph-tipos.js'

/**
 * Grafo de conocimiento (sección 8.3 del plan maestro): tipos de nodo en
 * `graph-tipos.ts`, catálogo de predicados en `graph-predicados.ts` y aquí la
 * arista tipada Relationship + los invariantes (replaced-by, aciclicidad).
 * Este módulo reexporta ambas superficies para mantener el API.
 */

export { NODE_TYPES, graphNodeId, isNodeType } from './graph-tipos.js'
export type { GraphNode, NodeType } from './graph-tipos.js'
export { PREDICATES, findPredicate, requirePredicate } from './graph-predicados.js'
export type { PredicateSpec } from './graph-predicados.js'

/**
 * Arista tipada (tabla relationship, sección 8.3.1).
 * (subject_type, subject_id) —[predicate]→ (object_type, object_id)
 */
export interface RelationshipProps {
  readonly subject: GraphNode
  readonly predicate: string
  readonly object: GraphNode
  readonly weight?: number | undefined
  readonly validFrom: string
  readonly validTo?: string | undefined
}

export class Relationship {
  readonly subject: GraphNode
  readonly predicate: string
  readonly object: GraphNode
  readonly weight?: number
  readonly validFrom: string
  readonly validTo?: string

  private constructor(props: RelationshipProps) {
    const spec = requirePredicate(props.predicate)
    if (!spec.domainTypes.includes(props.subject.type)) {
      throw new Error(
        `Predicado "${props.predicate}": tipo de sujeto "${props.subject.type}" no permitido (dominio: ${spec.domainTypes}).`,
      )
    }
    if (!spec.rangeTypes.includes(props.object.type)) {
      throw new Error(
        `Predicado "${props.predicate}": tipo de objeto "${props.object.type}" no permitido (rango: ${spec.rangeTypes}).`,
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(props.validFrom)) {
      throw new Error(`Relationship: valid_from debe ser ISO-8601: "${props.validFrom}".`)
    }
    if (props.weight !== undefined && (props.weight < 0 || props.weight > 1)) {
      throw new Error(`Relationship: weight fuera de [0,1]: ${props.weight}.`)
    }
    this.subject = Object.freeze({ ...props.subject })
    this.predicate = props.predicate
    this.object = Object.freeze({ ...props.object })
    this.weight = props.weight
    this.validFrom = props.validFrom
    this.validTo = props.validTo
    Object.freeze(this)
  }

  static create(props: RelationshipProps): Relationship {
    return new Relationship(props)
  }

  /** Cardinalidad "one" con validez vigente: ¿es esta la arista vigente del sujeto? */
  get isCurrent(): boolean {
    return this.validTo === undefined
  }
}

/**
 * Invariante: `replaced-by` obliga a estado EoL+ en el sujeto.
 * Se verifica sobre el catálogo de dispositivos (sección 8.6 regla 3).
 */
export interface ReplacedByCheckContext {
  readonly deviceStatus: (slug: string) => string | undefined
}

export function validateReplacedByInvariant(
  relationships: readonly Relationship[],
  ctx: ReplacedByCheckContext,
): string[] {
  const errors: string[] = []
  for (const rel of relationships) {
    if (rel.predicate !== 'replaced-by') continue
    const status = ctx.deviceStatus(rel.subject.slug)
    if (status === undefined) continue
    const eolLike = ['eol', 'eos', 'discontinued']
    if (!eolLike.includes(status)) {
      errors.push(
        `replaced-by "${rel.subject.slug}" → "${rel.object.slug}": el sujeto debe estar {eol, eos, discontinued}, pero está "${status}".`,
      )
    }
  }
  return errors
}

/** Validación de aciclicidad de un predicado acyclic (DFS; sección 8.6/19.5). */
export function findCycles(
  relationships: readonly Relationship[],
  predicateCodes: readonly string[],
): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const rel of relationships) {
    if (!predicateCodes.includes(rel.predicate)) continue
    const from = graphNodeId(rel.subject)
    const to = graphNodeId(rel.object)
    const list = adjacency.get(from) ?? []
    list.push(to)
    adjacency.set(from, list)
  }
  const cycles: string[][] = []
  const visited = new Set<string>()
  const stack: string[] = []

  const dfs = (node: string): void => {
    const idx = stack.indexOf(node)
    if (idx !== -1) {
      cycles.push([...stack.slice(idx), node])
      return
    }
    if (visited.has(node)) return
    visited.add(node)
    stack.push(node)
    for (const next of adjacency.get(node) ?? []) dfs(next)
    stack.pop()
  }

  for (const node of adjacency.keys()) dfs(node)
  return cycles
}
