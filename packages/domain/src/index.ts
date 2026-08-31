// Catálogo (sección 8.1)
export { Category, categoryMatchesAlias, categorySlug } from './catalog/category.js'
export type { CategoryProps } from './catalog/category.js'
export { Manufacturer } from './catalog/manufacturer.js'
export type { ManufacturerProps } from './catalog/manufacturer.js'
export { ProductFamily } from './catalog/product-family.js'
export type { ProductFamilyProps } from './catalog/product-family.js'
export { Device, Port } from './catalog/device.js'
export type { DeviceProps, PortProps } from './catalog/device.js'

// Value objects
export { Slug } from './value-objects/slug.js'
export { Speed } from './value-objects/speed.js'
export { OsiProfileValue } from './value-objects/osi-profile.js'
export type { OsiProfile, OsiLayerNumber } from './value-objects/osi-profile.js'
export { LIFECYCLE_STATUSES, isLifecycleStatus, requireLifecycleStatus } from './value-objects/lifecycle.js'
export type { LifecycleStatus } from './value-objects/lifecycle.js'

// Sourcing (sección 20)
export { Source, Assertion, CONFIDENCE_LEVELS, isConfidence } from './sourcing/assertion.js'
export type { SourceProps, AssertionProps, Confidence } from './sourcing/assertion.js'

// Grafo (sección 8.3)
export {
  NODE_TYPES,
  PREDICATES,
  findPredicate,
  requirePredicate,
  graphNodeId,
  findCycles,
  validateReplacedByInvariant,
} from './graph/graph.js'
export type {
  NodeType,
  GraphNode,
  PredicateSpec,
  RelationshipProps,
  ReplacedByCheckContext,
} from './graph/graph.js'
export { Relationship } from './graph/graph.js'

// Búsqueda: AST del DSL (sección 12.2)
export {
  CLAVES_DSL,
  consultaVacia,
  consultaCon,
  esClaveDsl,
} from './search/ast.js'
export type { ClaveDsl, DslTermino, ConsultaDsl } from './search/ast.js'

// Puertos (sección 6.6)
export type { DeviceRepository, CatalogRepository, DeviceQuery, Page } from './ports/device-repository.js'
export type { GraphRepository, NeighborsQuery, Path } from './ports/graph-repository.js'
export type {
  SearchIndex,
  SearchHit,
  SearchRequest,
  SearchResponse,
  SearchFacets,
  FacetValue,
  SuggestResult,
} from './ports/search-index.js'
export type { Clock, IdGen, Logger } from './ports/clock.js'