import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ServidorStore, PgDriver } from '../src/index.js'
import { SqliteServidorStore, SqliteExecutor, PostgresServidorStore, crearServidor, StaticBearerVerifier, traducirParametros } from '../src/index.js'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import type { OutboxEntry } from '@netatlas/domain'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, rmSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const migrationsDir = join(root, 'packages', 'data', 'migrations')
const seedPath = join(root, 'datasets', 'netatlas-seed.sqlite')

/** Servidor HTTP real en un puerto efímero + cliente fetch. */
function levantarServidor(): Promise<{ base: string; close: () => void }> {
  // Copia temporal del seed: los tests mutan la tabla de contribuciones y no
  // deben ensuciar datasets/netatlas-seed.sqlite (que persiste en disco).
  const tmp = join(root, 'datasets', `.server-test-${process.pid}-${Math.random().toString(36).slice(2)}.sqlite`)
  copyFileSync(seedPath, tmp)
  const db = new NodeSqliteDriver(tmp)
  applyMigrations(db, loadMigrations(migrationsDir))
  const search = new Fts5SearchIndex(db)
  const store = new SqliteServidorStore(db, new SqliteExecutor(db), search)
  const mid = crearServidor(store, new StaticBearerVerifier('token-prueba'), '0.1.0-test')
  const server: Server = createServer((req, res) => void mid(req, res))
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => {
          server.close()
          db.close()
          rmSync(tmp, { force: true })
        },
      })
    })
  })
}

describe('API REST del servidor (F8A, NET-HW-062) — HTTP real', () => {
  let base: string
  let closeServer: () => void
  const TOKEN = 'token-prueba'

  beforeAll(async () => {
    const s = await levantarServidor()
    base = s.base
    closeServer = s.close
  })

  afterAll(() => closeServer())

  it('health responde ok con versión', async () => {
    const r = await fetch(`${base}/api/health`)
    expect(r.status).toBe(200)
    expect((await r.json()) as { ok: boolean }).toMatchObject({ ok: true })
  })

  it('describe un dispositivo real por slug (seed 330)', async () => {
    const r = await fetch(`${base}/api/device/cisco-catalyst-9300-48p`)
    expect(r.status).toBe(200)
    const body = (await r.json()) as { name: string; categoryName: string }
    expect(body.name).toContain('9300')
    expect(body.categoryName.length).toBeGreaterThan(0)
  })

  it('404 para dispositivo inexistente', async () => {
    const r = await fetch(`${base}/api/device/no-existe`)
    expect(r.status).toBe(404)
  })

  it('search devuelve hits por DSL/texto libre', async () => {
    const r = await fetch(`${base}/api/search?q=9300&limit=5`)
    expect(r.status).toBe(200)
    const body = (await r.json()) as { total: number; hits: unknown[] }
    expect(body.total).toBeGreaterThan(0)
    expect(body.hits.length).toBeGreaterThan(0)
  })

  it('categories lista el catálogo cerrado', async () => {
    const r = await fetch(`${base}/api/categories`)
    expect(r.status).toBe(200)
    const body = (await r.json()) as { categorias: unknown[] }
    expect(body.categorias.length).toBeGreaterThan(0)
  })

  it('snapshot devuelve dispositivos desde una versión', async () => {
    const r = await fetch(`${base}/api/snapshot?since=0`)
    expect(r.status).toBe(200)
    const body = (await r.json()) as { version: number; dispositivos: unknown[] }
    expect(body.dispositivos.length).toBeGreaterThan(0)
  })

  it('POST /api/contributions sin auth → 401', async () => {
    const r = await fetch(`${base}/api/contributions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entradas: [] }),
    })
    expect(r.status).toBe(401)
  })

  it('POST /api/contributions con auth → acepta el outbox', async () => {
    const entrada: OutboxEntry = {
      id: 'c-http-1',
      tipo: 'propuesta-correccion',
      entidad: 'device:cisco-catalyst-9300-48p',
      autor: 'usuario-1',
      payload: { campo: 'name', valor: 'Cisco Catalyst 9300-48P v2' },
      createdAt: '2025-03-01T00:00:00.000Z',
      revision: 2,
      status: 'pendiente',
    }
    const r = await fetch(`${base}/api/contributions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ entradas: [entrada] }),
    })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { aceptadas: string[] }
    console.log('[debug-test] body contrib:', JSON.stringify(body))
    expect(body.aceptadas).toEqual(['c-http-1'])
  })

  it('ruta desconocida → 404', async () => {
    const r = await fetch(`${base}/api/no-existe`)
    expect(r.status).toBe(404)
  })
})

describe('Traducción de parámetros SQL → PostgreSQL', () => {
  it('convierte ? a $n en orden', () => {
    expect(traducirParametros('SELECT * FROM t WHERE a = ? AND b = ? OR c = ?')).toBe(
      'SELECT * FROM t WHERE a = $1 AND b = $2 OR c = $3',
    )
  })
})

describe('Adaptador PostgreSQL (NET-HW-062) — mismo contrato, driver doble', () => {
  /** Driver pg de prueba: registra SQL y responde filas vacías. */
  class PgFake implements PgDriver {
    sqls: string[] = []
    private rows = new Map<string, readonly Record<string, string | number | null>[]>()

    async query<T extends Record<string, string | number | null>>(sql: string, params: readonly (string | number | null)[] = []): Promise<readonly T[]> {
      this.sqls.push(sql)
      if (sql.includes('MAX(revision)')) {
        return [{ v: 0 }] as unknown as readonly T[]
      }
      const key = `${sql}|${params.join(',')}`
      return (this.rows.get(key) ?? []) as readonly T[]
    }

    async close(): Promise<void> {}
  }

  it('genera SQL PostgreSQL ($1, schema) y acepta contribuciones', async () => {
    const fake = new PgFake()
    const store = new PostgresServidorStore(fake, 'netatlas2')
    const entrada: OutboxEntry = {
      id: 'pg-1', tipo: 'nota', entidad: 'device:x', autor: 'u', payload: { nota: 'hola' },
      createdAt: '2025-03-01', revision: 4, status: 'pendiente',
    }
    const aceptadas = await store.recibirContribuciones([entrada])
    expect(aceptadas).toEqual(['pg-1'])
    const insert = fake.sqls.find((s) => s.includes('INSERT INTO'))
    expect(insert).toBeDefined()
    expect(insert).toContain('$1')
    expect(insert).toContain('netatlas2.netatlas_contribuciones')
    expect(insert).toContain('ON CONFLICT(id) DO UPDATE')
  })

  it('el adaptador cumple el contrato ServidorStore (tipo+forma)', async () => {
    const store: ServidorStore = new PostgresServidorStore(new PgFake())
    expect(typeof store.describe).toBe('function')
    expect(typeof store.snapshot).toBe('function')
    expect(typeof store.recibirContribuciones).toBe('function')
    expect(typeof store.version).toBe('function')
  })
})