import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, rmSync } from 'node:fs'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { generarClaveApi } from '../src/api-keys.js'
import {
  SqliteServidorStore,
  SqliteExecutor,
  SqlitePublicStore,
  crearServidor,
  crearApiPublica,
  StaticBearerVerifier,
} from '../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const migrationsDir = join(root, 'packages', 'data', 'migrations')
const seedPath = join(root, 'datasets', 'netatlas-seed.sqlite')

describe('F8B futuro — conjuntos de datos descargables firmados (§31.3)', () => {
  let base: string
  let closeServer: () => void
  let clave: string

  beforeAll(async () => {
    const tmp = join(root, 'datasets', `.server-f8b-ds-${process.pid}-${Math.random().toString(36).slice(2)}.sqlite`)
    copyFileSync(seedPath, tmp)
    const db = new NodeSqliteDriver(tmp)
    applyMigrations(db, loadMigrations(migrationsDir))
    const search = new Fts5SearchIndex(db)
    const store = new SqliteServidorStore(db, new SqliteExecutor(db), search, tmp)
    const publicStore = new SqlitePublicStore(db)
    const baseMid = crearServidor(store, new StaticBearerVerifier('token-sync'), '0.2.0-ds')
    const api = crearApiPublica({ store, publicStore, base: baseMid, limitePorMinuto: 200 })

    const server: Server = createServer((req, res) => void api(req, res))
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port
        base = `http://127.0.0.1:${port}`
        resolve()
      }),
    )
    closeServer = () => {
      server.close()
      db.close()
      rmSync(tmp, { force: true })
    }
    clave = generarClaveApi()
    await publicStore.registrarClave('key-ds-1', clave)
  })

  afterAll(() => closeServer())

  it('lista el conjunto firmado con sha256', async () => {
    const r = await fetch(`${base}/v1/datasets`, { headers: { authorization: `Bearer ${clave}` } })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { datasets: { nombre: string; sha256: string }[] }
    const seed = cuerpo.datasets.find((d) => d.nombre === 'netatlas-seed')
    expect(seed).toBeDefined()
    expect(seed?.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('descarga el SQLite con sha256 en la cabecera', async () => {
    const r = await fetch(`${base}/v1/datasets/netatlas-seed`, { headers: { authorization: `Bearer ${clave}` } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toContain('netatlas-seed.sqlite')
    const sha = r.headers.get('x-content-sha256')
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    const blob = await r.arrayBuffer()
    const cabecera = new Uint8Array(blob.slice(0, 16))
    expect(Array.from(cabecera)).toEqual([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00])
  })

  it('dataset inexistente → 404', async () => {
    const r = await fetch(`${base}/v1/datasets/no-existe`, { headers: { authorization: `Bearer ${clave}` } })
    expect(r.status).toBe(404)
  })
})
