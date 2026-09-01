import {
  NodeSqliteDriver,
  SqliteDeviceRepository,
  SqliteCatalogRepository,
  SqliteGraphRepository,
  SqliteSourcingRepository,
  SqliteAttributesRepository,
  SqliteTopologyRepository,
  SqliteQualityRepository,
  SqliteReconciliationRepository,
  ManifestRepository,
} from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSubgraph } from './adapters/in-memory.js'
import type { AppServices, UiSearchRepo, UiGraphRepo, UiQualityRepo } from './composition-root.js'
import type { UiReconciliationRow } from './adapters/in-memory.js'
import type { GraphNode, Relationship } from '@netatlas/domain'
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
    graph: new SqliteUiGraph(driver),
    sourcing: new SqliteSourcingRepository(driver),
    attributes: new SqliteAttributesRepository(driver),
    topologies: new SqliteTopologyRepository(driver),
    quality: new SqliteUiQuality(driver, dbPath),
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

/** Calidad + cola de reconciliación sobre SQLite (+ manifiesto del dataset). */
class SqliteUiQuality implements UiQualityRepo {
  private readonly calidad: SqliteQualityRepository
  private readonly cola: SqliteReconciliationRepository

  constructor(private readonly db: NodeSqliteDriver, private readonly dbPath: string) {
    this.calidad = new SqliteQualityRepository(db)
    this.cola = new SqliteReconciliationRepository(db)
  }

  async report(): Promise<ReturnType<SqliteQualityRepository['qualityReport']>> {
    return this.calidad.qualityReport()
  }

  async reconciliacionesPendientes(): Promise<readonly UiReconciliationRow[]> {
    return this.cola.pendientes()
  }

  async resolverReconciliacion(id: number, decision: 'accepted' | 'rejected', autor: string): Promise<void> {
    await this.cola.resolver(id, decision, autor)
  }

  async manifiesto(): Promise<Record<string, unknown> | undefined> {
    return new ManifestRepository().leer(`${this.dbPath}.manifest.json`) as Record<string, unknown> | undefined
  }
}

/** Grafo UI sobre SQLite: vecindad multi-salto + predicados + mapa global (NET-HW-030/036). */
class SqliteUiGraph extends SqliteGraphRepository implements UiGraphRepo {
  private readonly raw: NodeSqliteDriver

  constructor(driver: NodeSqliteDriver) {
    super(driver)
    this.raw = driver
  }

  async vecindad(node: GraphNode, maxDepth: number, predicates?: readonly string[]): Promise<ReturnType<typeof buildSubgraph>> {
    const aristas = await this.neighbors({ node, maxDepth, predicates })
    return buildSubgraph(aristas)
  }

  async predicadosDe(node: GraphNode): Promise<readonly { code: string; count: number }[]> {
    const aristas: readonly Relationship[] = await this.edgesOf(node)
    const counts = new Map<string, number>()
    for (const r of aristas) counts.set(r.predicate, (counts.get(r.predicate) ?? 0) + 1)
    return [...counts.entries()].map(([code, count]) => ({ code, count }))
  }

  /** Mapa global agregado por categoría (NET-HW-036). */
  async mapaGlobal(): Promise<ReturnType<typeof buildSubgraph>> {
    const nodeRows = this.raw
      .prepare(
        `SELECT c.code AS code, c.name_es AS name, COUNT(DISTINCT d.id) AS n
         FROM device d JOIN category c ON c.id = d.category_id
         GROUP BY c.code, c.name_es`,
      )
      .all() as { code: string; name: string; n: number }[]
    const nodes = nodeRows
      .sort((a, b) => b.n - a.n)
      .map((x) => ({ id: `category:${x.code}`, type: 'category', label: `${x.name} (${x.n})` }))

    const edgeRows = this.raw
      .prepare(
        `SELECT a.code AS a, b.code AS b, COUNT(*) AS n
         FROM relationship r
         JOIN device x ON r.subject_type = 'device' AND r.subject_id = x.id
         JOIN device y ON r.object_type = 'device' AND r.object_id = y.id
         JOIN category a ON a.id = x.category_id
         JOIN category b ON b.id = y.category_id
         WHERE a.code <> b.code
         GROUP BY a.code, b.code`,
      )
      .all() as { a: string; b: string; n: number }[]
    const edges = edgeRows.map(({ a, b, n }) => ({
      id: `category:${a}|category:${b}|n${n}`,
      source: `category:${a}`,
      target: `category:${b}`,
      predicate: `${n} enlace${n > 1 ? 's' : ''} entre categorías`,
    }))
    return { nodes, edges, predicates: [] }
  }
}