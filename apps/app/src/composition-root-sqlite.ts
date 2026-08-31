import {
  NodeSqliteDriver,
  SqliteDeviceRepository,
  SqliteCatalogRepository,
  SqliteGraphRepository,
  SqliteSourcingRepository,
} from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AppServices, UiDeviceRepo, UiCatalogRepo, UiSearchRepo, UiGraphRepo, UiSourcingRepo } from './composition-root.js'
import type { InMemoryDataset } from './adapters/in-memory.js'

/**
 * Composition root de la UI — MODO SQLITE REAL (Fase C).
 *
 * Construye los mismos puertos que las vistas consumen (AppServices) pero con
 * los repositorios reales de packages/data + FTS5 de packages/search, sobre el
 * dataset firmable `datasets/netatlas-seed.sqlite` (330 dispositivos).
 *
 * Navegador: esta composición usa node:sqlite (Node: desktop/tests/CI).
 * En la PWA estática el rol lo juega wa-sqlite con EL MISMO contrato de
 * puertos (F1-late); vistas y viewmodels no cambian.
 */

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')

/** Vista del dataset real para componentes que muestran estadísticas. */
function snapshotAccess(driver: NodeSqliteDriver): InMemoryDataset {
  const count = (t: string): number =>
    Number(driver.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get()?.c ?? 0)
  return {
    devices: [],
    manufacturers: [],
    categories: [],
    relationships: [],
    assertions: [],
    sources: [],
    // getters dinámicos para los pocos usos de lectura
  } as unknown as InMemoryDataset & {
    readonly deviceCount: number
  }
}

export function buildSqliteServices(dbPath = DB_PATH): AppServices {
  const driver = new NodeSqliteDriver(dbPath)

  const devices: UiDeviceRepo = new SqliteDeviceRepository(driver)
  const catalog: UiCatalogRepo = new SqliteCatalogRepository(driver)
  const graph: UiGraphRepo = new SqliteGraphRepository(driver)
  const sourcing: UiSourcingRepo = new SqliteSourcingRepository(driver)
  const search: UiSearchRepo = new Fts5SearchIndex(driver)

  const snapshot = snapshotAccess(driver)
  void snapshot

  return {
    devices,
    catalog,
    search,
    graph,
    sourcing,
    dataset: {
      devices: [],
      manufacturers: [],
      categories: [],
      relationships: [],
      assertions: [],
      sources: [],
    },
  }
}

// Re-export del builder para tests que quieran el driver
export { NodeSqliteDriver }