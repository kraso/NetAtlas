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
import { crearPerfil } from '@netatlas/domain'
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
