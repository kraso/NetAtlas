import { Slug } from '../value-objects/slug.js'

/** Tipos de extremo permitidos en las aristas del grafo. */
export const NODE_TYPES = [
  'device',
  'manufacturer',
  'product-family',
  'category',
  'interface',
  'port',
  'protocol',
  'standard',
  'technology',
  'medium',
  'component',
  'layer',
  'firmware',
  'topology',
  'speed-grade',
] as const

export type NodeType = (typeof NODE_TYPES)[number]

export function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value)
}

/** Un nodo del grafo: (type, slug). */
export interface GraphNode {
  readonly type: NodeType
  readonly slug: string
}

export function graphNodeId(node: GraphNode): string {
  return `${node.type}:${node.slug}`
}

/**
 * Catálogo de predicados (sección 8.3.2 del plan maestro).
 * Los predicados son datos (tabla predicate); aquí vive el catálogo canónico cerrado de la v1.
 */
export interface PredicateSpec {
  readonly code: string
  readonly domainTypes: readonly NodeType[]
  readonly rangeTypes: readonly NodeType[]
  readonly cardinality: 'one' | 'many'
  readonly symmetric: boolean
  readonly acyclic: boolean
  readonly inverseCode?: string | undefined
}

export const PREDICATES: readonly PredicateSpec[] = [
  { code: 'manufactured-by', domainTypes: ['device'], rangeTypes: ['manufacturer'], cardinality: 'one', symmetric: false, acyclic: false },
  { code: 'belongs-to-family', domainTypes: ['device'], rangeTypes: ['product-family'], cardinality: 'one', symmetric: false, acyclic: false },
  { code: 'has-category', domainTypes: ['device'], rangeTypes: ['category'], cardinality: 'one', symmetric: false, acyclic: false },
  { code: 'has-role-category', domainTypes: ['device'], rangeTypes: ['category'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'uses-interface', domainTypes: ['device'], rangeTypes: ['interface'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'supports-protocol', domainTypes: ['device'], rangeTypes: ['protocol'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'implements-standard', domainTypes: ['device', 'protocol', 'interface'], rangeTypes: ['standard'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'uses-technology', domainTypes: ['device'], rangeTypes: ['technology'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'operates-at-layer', domainTypes: ['device', 'category'], rangeTypes: ['layer'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'terminates-medium', domainTypes: ['device', 'interface'], rangeTypes: ['medium'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'compatible-with', domainTypes: ['device', 'interface'], rangeTypes: ['device', 'interface'], cardinality: 'many', symmetric: true, acyclic: false },
  { code: 'requires', domainTypes: ['device', 'interface'], rangeTypes: ['device'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'succeeds', domainTypes: ['device', 'product-family', 'technology'], rangeTypes: ['device', 'product-family', 'technology'], cardinality: 'many', symmetric: false, acyclic: true, inverseCode: 'precedes' },
  { code: 'precedes', domainTypes: ['device', 'product-family', 'technology'], rangeTypes: ['device', 'product-family', 'technology'], cardinality: 'many', symmetric: false, acyclic: true, inverseCode: 'succeeds' },
  { code: 'replaced-by', domainTypes: ['device'], rangeTypes: ['device'], cardinality: 'many', symmetric: false, acyclic: true },
  { code: 'similar-to', domainTypes: ['device'], rangeTypes: ['device'], cardinality: 'many', symmetric: true, acyclic: false },
  { code: 'variant-of', domainTypes: ['device'], rangeTypes: ['device'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'used-in-topology', domainTypes: ['device', 'category'], rangeTypes: ['topology'], cardinality: 'many', symmetric: false, acyclic: false },
  { code: 'evolves-into', domainTypes: ['technology', 'category'], rangeTypes: ['technology', 'category'], cardinality: 'many', symmetric: false, acyclic: true },
  { code: 'runs-firmware', domainTypes: ['device'], rangeTypes: ['firmware'], cardinality: 'many', symmetric: false, acyclic: false },
]

export function findPredicate(code: string): PredicateSpec | undefined {
  return PREDICATES.find((p) => p.code === code)
}

export function requirePredicate(code: string): PredicateSpec {
  const spec = findPredicate(code)
  if (!spec) {
    throw new Error(`Predicado desconocido: "${code}". Catálogo: ${PREDICATES.map((p) => p.code).join(', ')}.`)
  }
  return spec
}

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