/**
 * Barrel de repositorios SQLite para el asistente IA: reúne los imports de
 * `../repositories/*` en un solo módulo para que `sqlite-assistant-*.ts`
 * mantenga <=5 imports (regla AGENTS.md).
 */
export { SqliteCatalogRepository, SqliteDeviceRepository } from '../repositories/device-repository.js'
export { SqliteGraphRepository } from '../repositories/graph-repository.js'
export { SqliteSourcingRepository } from '../repositories/sourcing-repository.js'
export { SqliteAttributesRepository } from '../repositories/attributes-repository.js'
export { SqliteTopologyRepository } from '../repositories/topology-repository.js'
