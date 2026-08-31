import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SqliteDriver } from './driver.js'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

export interface MigrationResult {
  readonly applied: readonly number[]
  readonly skipped: readonly number[]
}

/**
 * Carga migraciones desde un directorio con archivos `NNNN_nombre.sql`.
 * Orden por número de versión ascendente.
 */
export function loadMigrations(dir: string): Migration[] {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
  return files.map((f) => {
    const version = Number(f.slice(0, 4))
    return {
      version,
      name: f,
      sql: readFileSync(join(dir, f), 'utf8'),
    }
  })
}

/**
 * Aplica migraciones pendientes dentro de una transacción.
 * La tabla schema_version registra la versión alcanzada.
 */
export function applyMigrations(
  driver: SqliteDriver,
  migrations: readonly Migration[],
): MigrationResult {
  const applied: number[] = []
  const skipped: number[] = []

  driver.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT NOT NULL
  )`)

  const row = driver
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version')
    .get()
  const current = Number(row?.v ?? 0)

  for (const migration of migrations) {
    if (migration.version <= current) {
      skipped.push(migration.version)
      continue
    }
    driver.transaction(() => {
      driver.exec(migration.sql)
      driver
        .prepare(
          'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
        )
        .run(
          migration.version,
          new Date().toISOString(),
          `Migración ${migration.version} ${migration.name}`,
        )
    })
    applied.push(migration.version)
  }

  return { applied, skipped }
}