import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Clock } from '@netatlas/domain'
import type { SqliteDriver } from './driver.js'
import { relojDelSistema } from './reloj.js'

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
 * La tabla schema_version registra la versión alcanzada. El reloj es
 * inyectable porque `applied_at` entra en el archivo del dataset: con el reloj
 * fijo del build, dos construcciones de las mismas fuentes dan el mismo
 * SQLite (y el mismo `sha256` en el manifiesto).
 */
export function applyMigrations(
  driver: SqliteDriver,
  migrations: readonly Migration[],
  clock: Clock = relojDelSistema,
): MigrationResult {
  driver.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT NOT NULL
  )`)
  const current = versionActual(driver)
  return {
    applied: aplicarPendientes(driver, migrations, current, clock),
    skipped: migrations.filter((migration) => migration.version <= current).map((migration) => migration.version),
  }
}

/** Versión de esquema ya aplicada (0 si la tabla se acaba de crear). */
function versionActual(driver: SqliteDriver): number {
  const row = driver.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get()
  return Number(row?.v ?? 0)
}

/** Aplica en una transacción las migraciones pendientes, en el orden recibido. */
function aplicarPendientes(
  driver: SqliteDriver,
  migrations: readonly Migration[],
  current: number,
  clock: Clock,
): number[] {
  const aplicadas: number[] = []
  for (const migration of migrations) {
    if (migration.version <= current) continue
    driver.transaction(() => {
      driver.exec(migration.sql)
      registrarVersion(driver, migration, clock)
    })
    aplicadas.push(migration.version)
  }
  return aplicadas
}

/** Deja constancia de la migración aplicada en `schema_version`. */
function registrarVersion(driver: SqliteDriver, migration: Migration, clock: Clock): void {
  driver
    .prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
    .run(migration.version, clock.now().toISOString(), `Migración ${migration.version} ${migration.name}`)
}