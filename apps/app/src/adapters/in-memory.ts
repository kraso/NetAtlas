/**
 * Adaptadores in-memory de los puertos del dominio para la UI.
 *
 * F1 UI: la app corre en navegador/tests SIN SQLite WASM (wa-sqlite llega en
 * F1-late con el mismo contrato de puertos). Este adaptador permite verificar
 * dashboards, explorador, ficha y panel OSI de forma determinista.
 * Sustitución real: paquete @netatlas/data (Sqlite*) — mismo contrato.
 *
 * Este módulo es la superficie pública (solo re-exports): la implementación
 * vive en los `in-memory-*.ts` hermanos, ninguno por encima de 200 líneas.
 */

// Tipos del dataset y contratos de vista (EAV, mapa, topologías).
export type {
  InMemoryDataset,
  InMemoryAttributeDefinition,
  InMemoryDeviceAttributeValue,
  UiAttributeDefinition,
  UiAttributesRepo,
  UiDeviceAttributeValue,
  UiFacetCount,
  UiGraphEdge,
  UiGraphNode,
  UiGraphSubgraph,
  UiTopologyRepo,
} from './in-memory-tipos.js'

// Calidad del dataset y cola de reconciliación (F6 §19.3).
export type { UiCoberturaCategoria, UiQualityReport, UiQualityRepo, UiReconciliationRow } from './in-memory-calidad.js'

// Repositorios del demo.
export { InMemoryCatalogRepository, InMemoryDeviceRepository, InMemorySearchIndex } from './in-memory-dispositivos.js'
export { buildSubgraph, InMemoryGraphRepository } from './in-memory-grafo.js'
export { InMemorySourcingRepository } from './in-memory-sourcing.js'
export { InMemoryAttributesRepository } from './in-memory-eav.js'
export { InMemoryTopologyRepository } from './in-memory-topologia.js'
export { InMemoryQualityRepository } from './in-memory-calidad.js'

// Dataset de demostración (determinista para tests/UI).
export { buildDemoDataset } from './in-memory-demo.js'

// Asistente IA demo (F7 §21).
export { UiAssistantRepoDemo } from './in-memory-ia.js'
export type { UiAssistantRepoLike } from './in-memory-ia.js'

// Re-export de utilidad para viewmodels
export { Assertion as AssertionModel, Relationship as RelationshipModel, requireLifecycleStatus, Slug, Source as SourceModel } from '@netatlas/domain'
export type { Confidence, Relationship as RelationshipType } from '@netatlas/domain'
