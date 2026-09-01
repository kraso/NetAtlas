import type { SqliteDriver } from '../driver.js'
import type {
  OutboxEntry,
  OutboxRepository,
  ReplicaRepository,
  SyncDevice,
} from '@netatlas/domain'
import { crearOutboxEntry } from '@netatlas/domain'

/**
 * Adaptador SQLite de la sincronización (F8A, §23.4 / NET-HW-063).
 *
 * Las tablas `netatlas_outbox` y `netatlas_replica` son RUNTIME-ONLY: viven en
 * la base local del usuario, NO forman parte del dataset firmado (el manifiesto
 * cubre el catálogo publicado; los datos de usuario van aparte, §22.4). Por ello
 * se crean idempotentemente al primer uso y no se numeran como migración del
 * dataset (el esquema 0001/0002 y manifiesto quedan intactos).
 */

const SQL_OUTBOX = `
  CREATE TABLE IF NOT EXISTS netatlas_outbox (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    entidad TEXT NOT NULL,
    autor TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revision INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente'
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_pendiente ON netatlas_outbox(status, created_at);
`

const SQL_REPLICA = `
  CREATE TABLE IF NOT EXISTS netatlas_replica (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    manufacturer_slug TEXT NOT NULL,
    category_code TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL
  );
`

export class SqliteOutboxRepository implements OutboxRepository {
  constructor(private readonly db: SqliteDriver) {
    db.exec(SQL_OUTBOX)
  }

  async enqueue(entrada: OutboxEntry): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO netatlas_outbox (id, tipo, entidad, autor, payload_json, created_at, revision, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(
        entrada.id,
        entrada.tipo,
        entrada.entidad,
        entrada.autor,
        JSON.stringify(entrada.payload),
        entrada.createdAt,
        entrada.revision,
      )
  }

  async pendientes(): Promise<readonly OutboxEntry[]> {
    const rows = this.db
      .prepare(`SELECT * FROM netatlas_outbox WHERE status = 'pendiente' ORDER BY created_at, revision`)
      .all() as unknown as OutboxRow[]
    return rows.map((r) => this.rowToEntry(r))
  }

  async marcarEnviadas(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    this.db
      .prepare(`UPDATE netatlas_outbox SET status = 'enviada' WHERE id IN (${placeholders})`)
      .run(...ids)
  }

  async ultimaRevision(): Promise<number> {
    const row = this.db.prepare('SELECT COALESCE(MAX(revision), 0) AS r FROM netatlas_outbox').get()
    return Number(row?.r ?? 0)
  }

  async ultimaModificacionEntidad(_entidad: string): Promise<string | undefined> {
    // El conflicto de entidad lo resuelve el servidor (LWW por updated_at); el
    // cliente solo serializa la cola. Se deja disponible para merge futuro.
    return undefined
  }

  private rowToEntry(r: OutboxRow): OutboxEntry {
    return crearOutboxEntry(
      {
        tipo: r.tipo as OutboxEntry['tipo'],
        entidad: r.entidad,
        autor: r.autor,
        payload: JSON.parse(r.payload_json) as Record<string, unknown>,
        revision: Number(r.revision),
      },
      r.id,
      r.created_at,
    )
  }
}

interface OutboxRow {
  id: string
  tipo: string
  entidad: string
  autor: string
  payload_json: string
  created_at: string
  revision: number
}

export class SqliteReplicaRepository implements ReplicaRepository {
  constructor(private readonly db: SqliteDriver) {
    db.exec(SQL_REPLICA)
  }

  async version(): Promise<number> {
    const row = this.db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM netatlas_replica').get()
    return Number(row?.v ?? 0)
  }

  async aplicarDevices(dispositivos: readonly SyncDevice[]): Promise<{ aplicados: number; version: number }> {
    let aplicados = 0
    this.db.transaction(() => {
      for (const d of dispositivos) {
        const res = this.db
          .prepare(
            `INSERT INTO netatlas_replica (slug, name, manufacturer_slug, category_code, lifecycle_status, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(slug) DO UPDATE SET
               name = excluded.name,
               manufacturer_slug = excluded.manufacturer_slug,
               category_code = excluded.category_code,
               lifecycle_status = excluded.lifecycle_status,
               updated_at = excluded.updated_at,
               version = excluded.version`,
          )
          .run(d.slug, d.name, d.manufacturerSlug, d.categoryCode, d.lifecycleStatus, d.updatedAt, d.version)
        aplicados += res.changes
      }
    })
    return { aplicados, version: await this.version() }
  }

  async count(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM netatlas_replica').get()
    return Number(row?.c ?? 0)
  }
}