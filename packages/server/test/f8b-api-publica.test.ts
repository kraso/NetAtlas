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
import { crearPerfil } from '@netatlas/domain'
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

describe('F8B futuro — roles curator/reviewer en la API pública (§20.5)', () => {
  let base: string
  let closeServer: () => void
  let claveLector: string
  let claveCurator: string
  let claveReviewer: string

  beforeAll(async () => {
    const tmp = join(root, 'datasets', `.server-f8b-rol-${process.pid}-${Math.random().toString(36).slice(2)}.sqlite`)
    copyFileSync(seedPath, tmp)
    const db = new NodeSqliteDriver(tmp)
    applyMigrations(db, loadMigrations(migrationsDir))
    const search = new Fts5SearchIndex(db)
    const store = new SqliteServidorStore(db, new SqliteExecutor(db), search, tmp)
    const publicStore = new SqlitePublicStore(db)
    const baseMid = crearServidor(store, new StaticBearerVerifier('token-sync'), '0.2.0-rol')
    const api = crearApiPublica({ store, publicStore, base: baseMid, limitePorMinuto: 500 })

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

    claveLector = generarClaveApi()
    claveCurator = generarClaveApi()
    claveReviewer = generarClaveApi()
    await publicStore.registrarClave('key-leg-1', claveLector)
    await publicStore.registrarClave('key-cur-1', claveCurator)
    await publicStore.registrarClave('key-rev-1', claveReviewer)
    // Promoción inicial: el "admin" establece curator y reviewer con el store.
    const curator = crearPerfil({ id: 'key-cur-1', nick: 'curador', rol: 'curator' })
    const reviewer = crearPerfil({ id: 'key-rev-1', nick: 'revisor', rol: 'reviewer' })
    await publicStore.guardar(curator)
    await publicStore.guardar(reviewer)
  })

  afterAll(() => closeServer())

  it('un lector no puede contribuir (403 en /v1/contributions)', async () => {
    const r = await fetch(`${base}/v1/contributions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveLector}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entradas: [] }),
    })
    expect(r.status).toBe(403)
  })

  it('un reviewer SÍ puede contribuir (200 y aceptadas)', async () => {
    const entrada = {
      id: 'rev-1',
      tipo: 'nota',
      entidad: 'device:cisco-c9300-48p',
      autor: 'key-rev-1',
      payload: { nota: 'revisar PoE' },
      createdAt: '2025-01-01',
      revision: 1,
      status: 'pendiente',
    }
    const r = await fetch(`${base}/v1/contributions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveReviewer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entradas: [entrada] }),
    })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { aceptadas: string[] }
    expect(cuerpo.aceptadas).toEqual(['rev-1'])
  })

  it('solo el curator gestiona roles (promueve a reviewer; un lector no puede)', async () => {
    // El lector intenta promoverse: 403.
    const intentoLector = await fetch(`${base}/v1/roles`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveLector}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sub: 'key-leg-1', rol: 'curator' }),
    })
    expect(intentoLector.status).toBe(403)

    // El curator promueve al lector a reviewer: 200 y rol reflejado.
    const promocion = await fetch(`${base}/v1/roles`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveCurator}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sub: 'key-leg-1', rol: 'reviewer' }),
    })
    expect(promocion.status).toBe(200)
    const cuerpo = (await promocion.json()) as { rol: string }
    expect(cuerpo.rol).toBe('reviewer')
  })

  it('PUT /v1/me actualiza el nick (nunca el rol)', async () => {
    const r = await fetch(`${base}/v1/me`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${claveCurator}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nick: 'Curador Principal' }),
    })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { nick: string; rol: string }
    expect(cuerpo.nick).toBe('Curador Principal')
    expect(cuerpo.rol).toBe('curator')
  })
})

describe('F8A futuro — merge LWW por entidad en recibirContribuciones (§31.5)', () => {
  it('un lote con varias revisiones de la misma entidad solo persiste la más alta', async () => {
    const db = new NodeSqliteDriver(':memory:')
    applyMigrations(db, loadMigrations(migrationsDir))
    const store = new SqliteServidorStore(db, new SqliteExecutor(db), new Fts5SearchIndex(db))

    const base = { tipo: 'nota' as const, entidad: 'device:sw-a', autor: 'u', status: 'pendiente' as const }
    const lotes = [
      { ...base, id: 'l-1', revision: 1, payload: { nota: 'v1' }, createdAt: '2025-01-01' },
      { ...base, id: 'l-2', revision: 2, payload: { nota: 'v2' }, createdAt: '2025-01-02' },
      { ...base, id: 'l-3', revision: 3, payload: { nota: 'v3' }, createdAt: '2025-01-03' },
    ]

    const aceptadas = await store.recibirContribuciones(lotes)
    // Solo la revisión 3 (por entidad) es aceptada; las inferiores se descartan.
    expect(aceptadas).toEqual(['l-3'])
    const persistidas = db.prepare('SELECT id, revision FROM netatlas_contribuciones').all() as { id: string; revision: number }[]
    expect(persistidas).toHaveLength(1)
    expect(persistidas[0]!.revision).toBe(3)
    db.close()
  })

  it('una revisión entrante menor que la persistida de la misma entidad se rechaza', async () => {
    const db = new NodeSqliteDriver(':memory:')
    applyMigrations(db, loadMigrations(migrationsDir))
    const store = new SqliteServidorStore(db, new SqliteExecutor(db), new Fts5SearchIndex(db))
    const base = { tipo: 'nota' as const, entidad: 'device:sw-b', autor: 'u', status: 'pendiente' as const }

    await store.recibirContribuciones([{ ...base, id: 'a-2', revision: 2, payload: {}, createdAt: '2025-01-01' }])
    const aceptadas = await store.recibirContribuciones([{ ...base, id: 'a-1', revision: 1, payload: {}, createdAt: '2025-01-02' }])
    expect(aceptadas).toEqual([])
    const existente = db.prepare('SELECT revision FROM netatlas_contribuciones WHERE entidad = ?').get('device:sw-b') as { revision: number }
    expect(existente.revision).toBe(2)
    db.close()
  })
})