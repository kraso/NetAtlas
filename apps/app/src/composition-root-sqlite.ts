import {
  NodeSqliteDriver,
  SqliteDeviceRepository,
  SqliteCatalogRepository,
  SqliteGraphRepository,
  SqliteSourcingRepository,
  SqliteAttributesRepository,
} from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AppServices, UiSearchRepo } from './composition-root.js'
import type { InMemoryDataset } from './adapters/in-memory.js'

/**
 * Composition root de la UI — MODO SQLITE REAL.
 *
 * Construye los mismos puertos que las vistas consumen (AppServices) pero con
 * los repositorios reales de packages/data + FTS5 de packages/search, sobre el
 * dataset firmable `datasets/netatlas-seed.sqlite` (330 dispositivos).
 *
 * Navegador: esta composición usa node:sqlite (Node: desktop/tests/CI).
 * En la PWA estática el rol lo juega wa-sqlite con EL MISMO contrato de
 * puertos; vistas y viewmodels no cambian.
 */

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')

/** Contrato de búsqueda SQLite + autocompletado agrupado (NET-HW-014). */
class SqliteUiSearch extends Fts5SearchIndex implements UiSearchRepo {
  constructor(
    driver: NodeSqliteDriver,
    private readonly catalog: SqliteCatalogRepository,
  ) {
    super(driver)
  }

  async suggestGrouped(prefix: string, limitPerGroup: number): Promise<Readonly<Record<string, readonly { slug: string; label: string }[]>>> {
    const [protocols, standards, media] = await Promise.all([
      this.catalog.listProtocols(),
      this.catalog.listStandards(),
      this.catalog.listMedia(),
    ])
    const p = prefix.toLowerCase()
    const match = (s: string): boolean => s.toLowerCase().includes(p)
    const slice = <T,>(list: readonly { slug: string; label: string }[]): readonly { slug: string; label: string }[] =>
      list.filter((i) => match(i.slug) || match(i.label)).slice(0, limitPerGroup)

    const devices = await this.suggest(prefix, limitPerGroup)
    return {
      'Dispositivos': devices.map((d) => ({ slug: d.slug, label: d.label })),
      'Protocolos': slice(protocols.map((pr) => ({ slug: pr.code, label: pr.name }))),
      'Estándares': slice(standards.map((s) => ({ slug: `${s.org}/${s.identifier}`, label: s.title }))),
      'Medios': slice(media.map((m) => ({ slug: m.code, label: m.name }))),
    }
  }
}

export function buildSqliteServices(dbPath = DB_PATH): AppServices {
  const driver = new NodeSqliteDriver(dbPath)
  const catalog = new SqliteCatalogRepository(driver)
  const search = new SqliteUiSearch(driver, catalog)

  return {
    devices: new SqliteDeviceRepository(driver),
    catalog,
    search,
    graph: new SqliteGraphRepository(driver),
    sourcing: new SqliteSourcingRepository(driver),
    attributes: new SqliteAttributesRepository(driver),
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

// Re-export del builder para tests que quieran el driver
export { NodeSqliteDriver }