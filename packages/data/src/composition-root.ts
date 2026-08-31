import { NodeSqliteDriver, applyMigrations, loadMigrations, CatalogDao } from './index.js'
import type { SqliteDriver } from './driver.js'
import { SqliteDeviceRepository, SqliteCatalogRepository } from './repositories/device-repository.js'
import { SqliteGraphRepository } from './repositories/graph-repository.js'
import type { Clock, DeviceRepository, CatalogRepository, GraphRepository, Logger, IdGen } from '@netatlas/domain'

/**
 * Composition root (NET-HW-004) — DI manual por runtime.
 * Cablea los adaptadores concretos según el entorno:
 *   - test / CLI / desktop → node:sqlite (NodeSqliteDriver)
 *   - PWA (F1 late)        → wa-sqlite (misma interfaz SqliteDriver)
 *
 * El dominio nunca conoce esta composición: solo ve los puertos.
 */
export interface RuntimeContext {
  readonly driver: SqliteDriver
  readonly repositories: {
    readonly device: DeviceRepository
    readonly catalog: CatalogRepository
    readonly graph: GraphRepository
  }
  readonly dao: CatalogDao
  readonly clock: Clock
  readonly idGen: IdGen
  readonly logger: Logger
}

export interface CompositionOptions {
  readonly migrationsDir: string
  readonly path: string | ':memory:'
  /**
   * Driver ya construido (p. ej. tests que siembran su propio :memory:).
   * Cuando se aporta, `path` se ignora.
   */
  readonly driver?: SqliteDriver
  readonly applyMigrationsFirst?: boolean
}

class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

class IncrementalIdGen implements IdGen {
  private nextId = 1
  next(): number {
    return this.nextId++
  }
}

class ConsoleLogger implements Logger {
  info(message: string, context?: Record<string, unknown>): void {
    console.info(`[INFO] ${message}`, context ?? '')
  }
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, context ?? '')
  }
  error(message: string, context?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, context ?? '')
  }
}

/** Compone la aplicación para un runtime concreto (test/CLI/desktop). */
export function composeRuntime(opts: CompositionOptions): RuntimeContext {
  const driver = opts.driver ?? new NodeSqliteDriver(opts.path)
  if (opts.applyMigrationsFirst ?? true) {
    applyMigrations(driver, loadMigrations(opts.migrationsDir))
  }
  const dao = new CatalogDao(driver)
  return {
    driver,
    repositories: {
      device: new SqliteDeviceRepository(driver),
      catalog: new SqliteCatalogRepository(driver),
      graph: new SqliteGraphRepository(driver),
    },
    dao,
    clock: new SystemClock(),
    idGen: new IncrementalIdGen(),
    logger: new ConsoleLogger(),
  }
}

/** Cierra limpiamente (checkpoint WAL incluido). */
export function disposeRuntime(ctx: RuntimeContext): void {
  ctx.driver.close()
}