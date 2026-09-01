import { describe, expect, it } from 'vitest'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { SqliteExecutor, crearRateLimiter, crearRateLimiterPersistente, SqlRateLimitStore } from '../src/index.js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const migrationsDir = join(root, 'packages', 'data', 'migrations')

describe('Rate limit compartido multi-nodo (F8B futuro, §31.3)', () => {
  it('respaldo en BD: dos instancias comparten el mismo límite', async () => {
    // Multi-nodo = dos limiter sobre la MISMA BD (ruta compartida).
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const executor = new SqliteExecutor(driver)
    const store = new SqlRateLimitStore(executor)

    const limiter = crearRateLimiterPersistente(3, store)
    const nodo2 = crearRateLimiterPersistente(3, store)

    expect(await limiter.allow('clave-x')).toBe(true) // 1/3
    expect(await nodo2.allow('clave-x')).toBe(true) // 2/3 (estado compartido)
    expect(await limiter.allow('clave-x')).toBe(true) // 3/3
    expect(await nodo2.allow('clave-x')).toBe(false) // 4/3 → excede (el otro nodo lo ve)
    await expect(limiter.retryAfter('clave-x')).resolves.toBeGreaterThan(0)

    // La fila quedó persistida en la BD (visitable por una tercera instancia).
    const tercera = new SqlRateLimitStore(executor)
    expect(await tercera.leer('clave-x')).toMatchObject({ count: 4 })
    driver.close()
  })

  it('revisión en memoria sigue funcionando en paralelo (contrato intacto)', () => {
    const mem = crearRateLimiter(2)
    expect(mem.allow('a')).toBe(true)
    expect(mem.allow('a')).toBe(true)
    expect(mem.allow('a')).toBe(false)
    expect(mem.limite()).toBe(2)
    expect(mem.retryAfter('a')).toBeGreaterThan(0)
  })
})