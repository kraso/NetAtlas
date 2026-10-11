import type { NodeType } from './graph-tipos.js'

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
