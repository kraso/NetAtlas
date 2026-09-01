/**
 * Adaptador SQLite del servidor (F8A). Usa el runtime real de NetAtlas
 * (packages/data + FTS5 de packages/search) — mismo SQL, mismos datos, misma
 * API. Es el almacén por defecto para un despliegue local de un solo nodo.
 *
 * Los "cambios" del snapshot se registran en una tabla runtime-only
 * (`netatlas_catalog_version`) para poder servir deltas desde una versión.
 */
import type { SqliteDriver } from '@netatlas/data'
import type { SearchIndex } from '@netatlas/domain'
import { mergeLWWporEntidad } from '@netatlas/domain'
import type { ServidorStore, ServerDevice, ServerHit, ServerSnapshotRow, SqlExecutor, DatasetPublico } from './store.js'
import type { OutboxEntry } from '@netatlas/domain'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const SQL_META = `
  CREATE TABLE IF NOT EXISTS netatlas_catalog_version (
    version INTEGER PRIMARY KEY,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS netatlas_contribuciones (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    entidad TEXT NOT NULL,
    autor TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    received_at TEXT NOT NULL,
    revision INTEGER NOT NULL
  );
`

export class SqliteExecutor implements SqlExecutor {
  constructor(private readonly db: SqliteDriver) {
    db.exec(SQL_META)
  }

  async query<T>(sql: string, params: readonly (string | number | null)[] = []): Promise<readonly T[]> {
    return this.db.prepare(sql).all(...params) as unknown as readonly T[]
  }

  async exec(sql: string, params: readonly (string | number | null)[] = []): Promise<{ changes: number }> {
    const res = this.db.prepare(sql).run(...params)
    return { changes: Number(res.changes) }
  }
}

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
    if (!this.dbPath || !existsSync(this.dbPath)) return []
    const buffer = readFileSync(this.dbPath)
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const manifiestoPath = `${this.dbPath}.manifest.json`
    let manifiesto: Record<string, unknown> = { sha256 }
    if (existsSync(manifiestoPath)) {
      try {
        manifiesto = JSON.parse(readFileSync(manifiestoPath, 'utf8')) as Record<string, unknown>
      } catch {
        // Sin manifiesto legible: se sirve el hash calculado igualmente.
      }
    }
    return [
      {
        nombre: 'netatlas-seed',
        manifiesto,
        blob: new Blob([buffer], { type: 'application/x-sqlite3' }),
        sha256,
      },
    ]
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
    const rows = await this.executor.query<{ code: string; name_es: string }>(
      'SELECT code, name_es FROM category ORDER BY code',
    )
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

  /**
   * Versión del catálogo servidor: serie del dataset (conteo de dispositivos)
   * + revisiones de contribuciones aceptadas. Monótona y estable para deltas.
   */
  async version(): Promise<number> {
    const filas = await this.executor.query<{ c: number }>('SELECT COUNT(*) AS c FROM device')
    const contrib = await this.executor.query<{ r: number }>(
      'SELECT COALESCE(MAX(revision), 0) AS r FROM netatlas_contribuciones',
    )
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
      const existente = await this.executor.query<{ revision: number }>(
        'SELECT revision FROM netatlas_contribuciones WHERE entidad = ?',
        [e.entidad],
      )
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