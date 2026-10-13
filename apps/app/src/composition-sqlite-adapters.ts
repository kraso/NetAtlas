import {
  NodeSqliteDriver,
  SqliteCatalogRepository,
  SqliteGraphRepository,
  SqliteQualityRepository,
  SqliteReconciliationRepository,
  ManifestRepository,
  SqliteToolContext,
} from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { crearClienteIA, type RespuestaIA, type GraphNode, type Relationship } from '@netatlas/domain'
import { buildSubgraph, type UiReconciliationRow } from './adapters/in-memory.js'
import type { UiSearchRepo, UiGraphRepo, UiQualityRepo, UiAssistantRepo } from './composition-root.js'

/**
 * Adaptadores SQLite de la UI (modo dataset real): los mismos puertos que las
 * vistas consumen, implementados sobre los repositorios de packages/data.
 * El flag de IA persiste en localStorage (best-effort, con registro si falla).
 */

const CLAVE_IA = 'netatlas.ai.enabled'

/** Contrato de búsqueda SQLite + autocompletado agrupado (NET-HW-014). */
export class SqliteUiSearch extends Fts5SearchIndex implements UiSearchRepo {
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
    const slice = <T,>(list: readonly { slug: string; label: string }[]): readonly { slug: string; label: string }[] =>
      list.filter((i) => i.slug.toLowerCase().includes(p) || i.label.toLowerCase().includes(p)).slice(0, limitPerGroup)

    const devices = await this.suggest(prefix, limitPerGroup)
    return {
      'Dispositivos': devices.map((d) => ({ slug: d.slug, label: d.label })),
      'Protocolos': slice(protocols.map((pr) => ({ slug: pr.code, label: pr.name }))),
      'Estándares': slice(standards.map((s) => ({ slug: `${s.org}/${s.identifier}`, label: s.title }))),
      'Medios': slice(media.map((m) => ({ slug: m.code, label: m.name }))),
    }
  }
}

/** Asistente IA sobre SQLite real (F7 §21): cliente del dominio + flag. */
export class SqliteUiAssistant implements UiAssistantRepo {
  private readonly port: { ask(p: { texto: string }): Promise<RespuestaIA> }

  constructor(toolCtx: SqliteToolContext) {
    this.port = crearClienteIA(toolCtx) as { ask(p: { texto: string }): Promise<RespuestaIA> }
  }

  async ask(texto: string): Promise<RespuestaIA> {
    return this.port.ask({ texto })
  }

  enabled(): boolean {
    try {
      return localStorage.getItem(CLAVE_IA) === 'on'
    } catch (error) {
      console.warn('[WARN] no se pudo leer el flag de IA; se deshabilita el asistente', { error })
      return false
    }
  }

  setEnabled(on: boolean): void {
    try {
      if (on) localStorage.setItem(CLAVE_IA, 'on')
      else localStorage.removeItem(CLAVE_IA)
    } catch (error) {
      // Persistencia best-effort del flag: no bloquea, pero queda registrado.
      console.warn('[WARN] no se pudo persistir el flag de IA', { error })
    }
  }
}

/** Calidad + cola de reconciliación sobre SQLite (+ manifiesto del dataset). */
export class SqliteUiQuality implements UiQualityRepo {
  private readonly calidad: SqliteQualityRepository
  private readonly cola: SqliteReconciliationRepository

  constructor(db: NodeSqliteDriver, private readonly dbPath: string) {
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
export class SqliteUiGraph extends SqliteGraphRepository implements UiGraphRepo {
  constructor(private readonly raw: NodeSqliteDriver) {
    super(raw)
  }

  async vecindad(node: GraphNode, maxDepth: number, predicates?: readonly string[]): Promise<ReturnType<typeof buildSubgraph>> {
    return buildSubgraph(await this.neighbors({ node, maxDepth, predicates }))
  }

  async predicadosDe(node: GraphNode): Promise<readonly { code: string; count: number }[]> {
    const counts = new Map<string, number>()
    for (const r of (await this.edgesOf(node)) as readonly Relationship[]) {
      counts.set(r.predicate, (counts.get(r.predicate) ?? 0) + 1)
    }
    return [...counts.entries()].map(([code, count]) => ({ code, count }))
  }

  /** Mapa global agregado por categoría (NET-HW-036). */
  async mapaGlobal(): Promise<ReturnType<typeof buildSubgraph>> {
    const nodes = filasCategorias(this.raw)
      .sort((a, b) => b.n - a.n)
      .map((x) => ({ id: `category:${x.code}`, type: 'category', label: `${x.name} (${x.n})` }))
    const edges = filasEnlacesEntreCategorias(this.raw).map(({ a, b, n }) => ({
      id: `category:${a}|category:${b}|n${n}`,
      source: `category:${a}`,
      target: `category:${b}`,
      predicate: `${n} enlace${n > 1 ? 's' : ''} entre categorías`,
    }))
    return { nodes, edges, predicates: [] }
  }
}

type FilaCategoria = { code: string; name: string; n: number }

/** Categorías con su número de dispositivos (para los nodos del mapa). */
function filasCategorias(raw: NodeSqliteDriver): FilaCategoria[] {
  return raw
    .prepare(
      `SELECT c.code AS code, c.name_es AS name, COUNT(DISTINCT d.id) AS n
       FROM device d JOIN category c ON c.id = d.category_id
       GROUP BY c.code, c.name_es`,
    )
    .all() as FilaCategoria[]
}

/** Relaciones device↔device agregadas entre categorías distintas. */
function filasEnlacesEntreCategorias(raw: NodeSqliteDriver): { a: string; b: string; n: number }[] {
  return raw
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
}
