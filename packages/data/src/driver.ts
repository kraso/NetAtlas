import { createRequire } from 'node:module'

/** Resolución en runtime de node:sqlite (builtin nuevo, invisible para bundlers). */
const require = createRequire(import.meta.url)
type DatabaseSyncType = typeof import('node:sqlite').DatabaseSync
const { DatabaseSync }: { DatabaseSync: DatabaseSyncType } = require('node:sqlite') as { DatabaseSync: DatabaseSyncType }

/**
 * Contrato mínimo de driver SQLite para NetAtlas (Fase 0).
 * Implementaciones: node:sqlite (Node nativo), wa-sqlite (F1, navegador),
 * better-sqlite3 (tests/CLI legacy). El dominio nunca ve esto: vive tras los puertos.
 */

export type SqlValue = string | number | bigint | null | Uint8Array

export interface SqlRow {
  [column: string]: SqlValue
}

export interface PreparedStatement {
  all(...params: readonly SqlValue[]): SqlRow[]
  get(...params: readonly SqlValue[]): SqlRow | undefined
  run(...params: readonly SqlValue[]): { changes: number; lastInsertRowid: number }
}

export interface SqliteDriver {
  exec(sql: string): void
  prepare(sql: string): PreparedStatement
  /** Ejecuta callback dentro de BEGIN…COMMIT con rollback ante error. */
  transaction<T>(fn: () => T): T
  close(): void
}

/** Adaptador sobre node:sqlite (DatabaseSync) — runtime Node desktop/CLI/tests. */
export class NodeSqliteDriver implements SqliteDriver {
  readonly db: InstanceType<DatabaseSyncType>

  constructor(path: string | ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql)
    return {
      all: (...params) => stmt.all(...params) as SqlRow[],
      get: (...params) => stmt.get(...params) as SqlRow | undefined,
      run: (...params) => {
        const res = stmt.run(...params)
        return {
          changes: Number(res.changes),
          lastInsertRowid: Number(res.lastInsertRowid),
        }
      },
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.db.close()
  }
}