import type { SqliteDriver } from '@netatlas/data'
import type { SqlExecutor } from './store.js'

/**
 * Ejecutor SQLite del servidor: envuelve el driver de `@netatlas/data` y crea
 * las tablas runtime-only del catálogo (versión de snapshot y contribuciones)
 * en cuanto se instancia.
 */

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