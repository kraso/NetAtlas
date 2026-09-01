export { NodeSqliteDriver } from './driver.js'
export type { SqliteDriver, SqlValue, SqlRow, PreparedStatement } from './driver.js'
export { loadMigrations, applyMigrations } from './migrator.js'
export type { Migration, MigrationResult } from './migrator.js'
export { CatalogDao } from './daos/catalog-dao.js'
export type {
  ManufacturerRow,
  CategoryRow,
  DeviceRow,
  PortRow,
  SourceRow,
  AssertionRow,
  RelationshipRow,
} from './daos/catalog-dao.js'
export { SqliteDeviceRepository, SqliteCatalogRepository } from './repositories/device-repository.js'
export { SqliteGraphRepository } from './repositories/graph-repository.js'
export { SqliteSourcingRepository } from './repositories/sourcing-repository.js'
export { SqliteAttributesRepository } from './repositories/attributes-repository.js'
export type { AttributeDefinitionRow, DeviceAttributeRow, FacetCount } from './repositories/attributes-repository.js'
export { SqliteTopologyRepository } from './repositories/topology-repository.js'
export { composeRuntime, disposeRuntime } from './composition-root.js'
export type { RuntimeContext, CompositionOptions } from './composition-root.js'

/** Versión de esquema del dataset que esta app soporta (sección 19.4). */
export const DATASET_SCHEMA_VERSION = 1