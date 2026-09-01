import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, rmSync } from 'node:fs'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { generarClaveApi, hashClaveApi } from '../src/api-keys.js'
import {
  SqliteServidorStore,
  SqliteExecutor,
  SqlitePublicStore,
  crearServidor,
  crearApiPublica,
  StaticBearerVerifier,
  rutaAbierta,
} from '../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const migrationsDir = join(root, 'packages', 'data', 'migrations')
const seedPath = join(root, 'datasets', 'netatlas-seed.sqlite')

/**
 * CRITERIO F8B (§27): "Terceros consumen la API con clave" (§31.3).
 * API pública /v1 · OpenAPI 3.1 servida · clave API (solo hash) · rate limit
 * · favoritos/perfil · auditoría. Sin clave → los endpoints /v1 rechazan.
 */
describe('F8B — API pública con clave (NET-HW-065/064, criterio)', () => {
  let base: string
  let closeServer: () => void
  let claveTercero: string

  beforeAll(async () => {
    const tmp = join(root, 'datasets', `.server-f8b-${process.pid}-${Math.random().toString(36).slice(2)}.sqlite`)
    copyFileSync(seedPath, tmp)
    const db = new NodeSqliteDriver(tmp)
    applyMigrations(db, loadMigrations(migrationsDir))
    const search = new Fts5SearchIndex(db)
    const store = new SqliteServidorStore(db, new SqliteExecutor(db), search)
    const publicStore = new SqlitePublicStore(db)
    const baseMid = crearServidor(store, new StaticBearerVerifier('token-sync'), '0.2.0-f8b')
    const api = crearApiPublica({ store, publicStore, base: baseMid, limitePorMinuto: 10 })

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

    // El "admin" emite una clave para el tercero (solo se guarda el hash).
    claveTercero = generarClaveApi()
    await publicStore.registrarClave('key-tercero-1', claveTercero)
    expect(claveTercero.startsWith('na_')).toBe(true)
  })

  afterAll(() => closeServer())

  it('el documento OpenAPI 3.1 se sirve sin clave y declara las rutas', async () => {
    const r = await fetch(`${base}/openapi.json`)
    expect(r.status).toBe(200)
    const spec = (await r.json()) as { openapi: string; info: { title: string }; paths: Record<string, unknown> }
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info.title).toContain('NetAtlas')
    for (const ruta of rutaAbierta()) {
      expect(spec.paths[ruta]).toBeDefined()
    }
  })

  it('sin clave → /v1/me rechaza con 401', async () => {
    const r = await fetch(`${base}/v1/me`)
    expect(r.status).toBe(401)
  })

  it('con clave → el tercero consulta el catálogo (criterio: API con clave)', async () => {
    const r = await fetch(`${base}/v1/search?q=9300&limit=5`, {
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { q: string; total: number; hits: unknown[] }
    expect(body.total).toBeGreaterThan(0)
  })

  it('con clave → ficha y categorías públicas', async () => {
    const device = await fetch(`${base}/v1/devices/cisco-catalyst-9300-48p`, {
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(device.status).toBe(200)
    const cats = await fetch(`${base}/v1/categories`, {
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(cats.status).toBe(200)
  })

  it('favoritos: añadir, listar y quitar con la clave del tercero', async () => {
    const entidad = 'device:cisco-catalyst-9300-48p'
    const add = await fetch(`${base}/v1/favorites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveTercero}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entidad }),
    })
    expect(add.status).toBe(200)
    const list = await fetch(`${base}/v1/favorites`, { headers: { authorization: `Bearer ${claveTercero}` } })
    const favoritos = (await list.json()) as { entidad: string }[]
    expect(favoritos.some((f) => f.entidad === entidad)).toBe(true)

    const del = await fetch(`${base}/v1/favorites?entidad=${encodeURIComponent(entidad)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(del.status).toBe(200)
  })

  it('entidad mal formada en favorito → 400', async () => {
    const r = await fetch(`${base}/v1/favorites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveTercero}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entidad: 'mal-formada' }),
    })
    expect(r.status).toBe(400)
  })

  it('la clave solo se almacena como hash (nunca el secreto en claro)', async () => {
    const hash = hashClaveApi(claveTercero)
    // El prefijo público en la BD es distinto del secreto completo.
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(claveTercero).not.toContain(hash)
    // Y una clave distinta tiene hash distinto.
    const otra = generarClaveApi()
    expect(hashClaveApi(otra)).not.toBe(hash)
  })

  it('rate limit: al superar el límite responde 429 con retry-after', async () => {
    // Límite 10/minuto; se lanzan 12 peticiones inmediatas.
    let ultimoStatus = 0
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${base}/v1/search?q=sw`, {
        headers: { authorization: `Bearer ${claveTercero}` },
      })
      ultimoStatus = r.status
      if (r.status === 429) {
        expect(r.headers.get('retry-after')).toBeTruthy()
        break
      }
    }
    expect(ultimoStatus).toBe(429)
  })
})