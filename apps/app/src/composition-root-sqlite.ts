import {
  NodeSqliteDriver,
  SqliteDeviceRepository,
  SqliteCatalogRepository,
  SqliteSourcingRepository,
  SqliteAttributesRepository,
  SqliteTopologyRepository,
  SqliteToolContext,
} from '@netatlas/data'
import type { AppServices } from './composition-root.js'
import type { InMemoryDataset } from './adapters/in-memory.js'
import { SqliteUiAssistant, SqliteUiGraph, SqliteUiQuality, SqliteUiSearch } from './composition-sqlite-adapters.js'
import { DB_PATH } from './composition-sqlite-rutas.js'

/**
 * Composition root de la UI — MODO SQLITE REAL.
 *
 * Construye los mismos puertos que las vistas consumen (AppServices) pero con
 * los repositorios reales de packages/data + FTS5 de packages/search, sobre el
 * dataset firmable `datasets/netatlas-seed.sqlite` (330 dispositivos). Los
 * adaptadores por puerto viven en `composition-sqlite-adapters.ts`.
 *
 * Navegador: esta composición usa node:sqlite (Node: desktop/tests/CI).
 * En la PWA estática el rol lo juega wa-sqlite con EL MISMO contrato de
 * puertos; vistas y viewmodels no cambian.
 */

export function buildSqliteServices(dbPath = DB_PATH): AppServices {
  const driver = new NodeSqliteDriver(dbPath)
  const catalog = new SqliteCatalogRepository(driver)
  const search = new SqliteUiSearch(driver, catalog)
  const toolCtx = new SqliteToolContext(driver, search)

  return {
    devices: new SqliteDeviceRepository(driver),
    catalog,
    search,
    graph: new SqliteUiGraph(driver),
    sourcing: new SqliteSourcingRepository(driver),
    attributes: new SqliteAttributesRepository(driver),
    topologies: new SqliteTopologyRepository(driver),
    quality: new SqliteUiQuality(driver, dbPath),
    asistente: new SqliteUiAssistant(toolCtx),
    dataset: {
      devices: [],
      manufacturers: [],
      categories: [],
      relationships: [],
      assertions: [],
      sources: [],
    } as unknown as InMemoryDataset,
  }
}

// Re-export del builder para tests que quieran el driver.
export { NodeSqliteDriver }
