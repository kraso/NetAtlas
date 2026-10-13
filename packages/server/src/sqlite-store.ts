/**
 * Adaptador SQLite del servidor (F8A). Usa el runtime real de NetAtlas
 * (packages/data + FTS5 de packages/search) — mismo SQL, mismos datos, misma
 * API. Es el almacén por defecto para un despliegue local de un solo nodo.
 *
 * Los "cambios" del snapshot se registran en una tabla runtime-only
 * (`netatlas_catalog_version`) para poder servir deltas desde una versión.
 * El detalle (F8B-detalle) vive en `sqlite-store-detalle.ts` (consultas en
 * `sqlite-snapshot-sql.ts`, mapeo puro en `sqlite-snapshot-mapeo.ts`) y los
 * conjuntos descargables en `sqlite-store-datasets.ts`.
 */
import type { SqliteDriver } from '@netatlas/data'
import { mergeLWWporEntidad, type OutboxEntry, type SearchIndex } from '@netatlas/domain'
import type { ServidorStore, ServerDevice, ServerHit, ServerSnapshotRow, SnapshotLink, SnapshotDetail, SqlExecutor, DatasetPublico } from './store.js'
import { conjuntosDeDatos, consultarDetalle, SqliteExecutor } from './sqlite-store-piezas.js'

export { SqliteExecutor }

export class SqliteServidorStore implements ServidorStore {
  constructor(
    private readonly db: SqliteDriver,
    private readonly executor: SqliteExecutor,
    private readonly indiceBusqueda: SearchIndex,
    /** Ruta real del archivo SQLite (para servir el dataset firmado, §31.3). */
    private readonly dbPath?: string,
  ) {}

  /** Conjuntos de datos descargables firmados (§31.3 / F8B futuro). */
  async conjuntosDeDatos(): Promise<readonly DatasetPublico[]> {
    return conjuntosDeDatos(this.dbPath)
  }

  async describe(slug: string): Promise<ServerDevice | undefined> {
    const rows = await this.executor.query<{
      slug: string
      name: string
      manufacturer_slug: string
      category_code: string
      category_name: string
      lifecycle_status: string
    }>(
      `SELECT d.slug, d.name, m.slug AS manufacturer_slug, c.code AS category_code,
              c.name_es AS category_name, d.lifecycle_status
       FROM device d
       JOIN manufacturer m ON m.id = d.manufacturer_id
       JOIN category c ON c.id = d.category_id
       WHERE d.slug = ?`,
      [slug],
    )
    const r = rows[0]
    if (!r) return undefined
    return {
      slug: r.slug,
      name: r.name,
      manufacturerSlug: r.manufacturer_slug,
      categoryCode: r.category_code,
      categoryName: r.category_name,
      lifecycleStatus: r.lifecycle_status,
    }
  }

  async search(q: string, limit: number): Promise<readonly ServerHit[]> {
    const res = await this.indiceBusqueda.query({ rawQuery: q, limit })
    return res.hits.map((h) => ({ slug: h.slug, name: h.name, score: h.score }))
  }

  async categorias(): Promise<readonly { code: string; nameEs: string }[]> {
    const rows = await this.executor.query<{ code: string; name_es: string }>('SELECT code, name_es FROM category ORDER BY code')
    return rows.map((r) => ({ code: r.code, nameEs: r.name_es }))
  }

  async snapshot(since: number): Promise<readonly ServerSnapshotRow[]> {
    const base = await this.version()
    if (since >= base) return []
    const filas = await this.executor.query<{
      slug: string
      name: string
      manufacturer_slug: string
      category_code: string
      lifecycle_status: string
      updated_at: string
    }>(
      `SELECT d.slug, d.name, m.slug AS manufacturer_slug, c.code AS category_code,
              d.lifecycle_status, COALESCE(d.updated_at, '1970-01-01') AS updated_at
       FROM device d
       JOIN manufacturer m ON m.id = d.manufacturer_id
       JOIN category c ON c.id = d.category_id
       WHERE ? = 0 OR d.id > ?
       ORDER BY d.id
       LIMIT 5000`,
      [since, since],
    )
    return filas.map((f) => ({
      slug: f.slug,
      name: f.name,
      manufacturerSlug: f.manufacturer_slug,
      categoryCode: f.category_code,
      lifecycleStatus: f.lifecycle_status,
      updatedAt: f.updated_at,
      // La versión de cada fila es la versión servidor en que fue emitida.
      version: base,
    }))
  }

  /** Aristas de topología entre dispositivos (desde topology_edge/runtime-only
   *  cambios; cuando since=0 sirve el snapshot completo de edges).
   *  NOTA: la DB modela topología en `topology_edge` (322 aristas) no en
   *  `relationship` (device→standard/layer/protocol/medium). Se expone como
   *  `compatible-with` (validado en el dominio, simétrico device↔device) para
   *  que el warmezo UI construya el mapa/arquitectura sin un device→device real. */
  async snapshotLinks(since: number): Promise<readonly SnapshotLink[]> {
    const base = await this.version()
    if (since >= base) return []
    const rows = await this.executor.query<{ from_slug: string; to_slug: string }>(
      `SELECT ds.slug AS from_slug, do.slug AS to_slug
       FROM topology_edge e
       JOIN topology_node ns ON ns.id = e.from_node  AND ns.entity_type = 'device'
       JOIN topology_node no ON no.id = e.to_node    AND no.entity_type = 'device'
       JOIN device ds ON ds.id = ns.entity_id
       JOIN device do ON do.id = no.entity_id
       WHERE ds.slug <> do.slug
       ORDER BY ds.slug, do.slug`,
    )
    return rows.map((r) => ({ from: r.from_slug, to: r.to_slug, predicate: 'compatible-with' }))
  }

  /** Detalle por dispositivo para la ficha UI sin N+1 (F8B-detalle): resumen,
   *  perfil OSI, puertos, aristas de catálogo, afirmaciones con fuente, valores
   *  EAV + catálogos — consulta y mapeo en `sqlite-store-detalle.ts`. */
  async snapshotDetail(_since: number): Promise<SnapshotDetail> {
    const base = await this.version()
    return consultarDetalle(this.executor, _since, base)
  }

  /** Versión actual: nº de dispositivos + revisiones de contribuciones aceptadas. Monótona y estable para deltas. */
  async version(): Promise<number> {
    const filas = await this.executor.query<{ c: number }>('SELECT COUNT(*) AS c FROM device')
    const contrib = await this.executor.query<{ r: number }>('SELECT COALESCE(MAX(revision), 0) AS r FROM netatlas_contribuciones')
    return Number(filas[0]?.c ?? 0) + Number(contrib[0]?.r ?? 0)
  }

  async recibirContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]> {
    // Merge last-writer-wins POR ENTIDAD (§31.5 / F8A futuro): si un lote trae
    // varias revisiones de la misma entidad, solo sobrevive la más alta; y si
    // el servidor ya tiene una revisión mayor de esa entidad, la entrante se
    // descarta (de id a id, la revisión del mismo id gana).
    const dedupe = mergeLWWporEntidad(entradas)
    const aceptadas: string[] = []
    for (const e of dedupe) {
      // LWW por entidad: si ya existe una revisión mayor de la entidad, se rechaza.
      const existente = await this.executor.query<{ revision: number }>('SELECT revision FROM netatlas_contribuciones WHERE entidad = ?', [e.entidad])
      if (existente[0] && Number(existente[0].revision) >= e.revision) continue
      await this.executor.exec(
        `INSERT INTO netatlas_contribuciones (id, tipo, entidad, autor, payload_json, received_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, received_at = excluded.received_at`,
        [e.id, e.tipo, e.entidad, e.autor, JSON.stringify(e.payload), e.createdAt, e.revision],
      )
      aceptadas.push(e.id)
    }
    return aceptadas
  }
}
