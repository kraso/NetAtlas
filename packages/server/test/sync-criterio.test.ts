import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, rmSync } from 'node:fs'
import { NodeSqliteDriver, applyMigrations, loadMigrations, SqliteOutboxRepository, SqliteReplicaRepository } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { crearOutboxEntry, sincronizar } from '@netatlas/domain'
import { SqliteServidorStore, SqliteExecutor, crearServidor, StaticBearerVerifier, HttpSyncServer } from '../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const migrationsDir = join(root, 'packages', 'data', 'migrations')
const seedPath = join(root, 'datasets', 'netatlas-seed.sqlite')

/**
 * CRITERIO F8A (§27): "la app funciona offline y sincroniza al recuperar red"
 * (§23.4[3], NET-HW-063, §6.7 — sin tocar dominio ni vistas).
 *
 * Flujo verificado con componentes reales:
 *   1) Cliente sin red: encola contribuciones en el outbox local (no se pierden).
 *   2) Se recupera la red: `sincronizar()` tira del snapshot del servidor
 *      (réplica local) y empuja la cola; el servidor recibe y confirma.
 *   3) La cola queda vacía y la réplica contiene los dispositivos del servidor.
 */
describe('F8A — rèplica offline + outbox (NET-HW-063, criterio offline+sync)', () => {
  let base: string
  let closeServer: () => void
  const TOKEN = 'token-sync'

  beforeAll(async () => {
    // Copia temporal del seed: el push de contribuciones muta la BD servidor.
    const tmp = join(root, 'datasets', `.server-sync-${process.pid}-${Math.random().toString(36).slice(2)}.sqlite`)
    copyFileSync(seedPath, tmp)
    const db = new NodeSqliteDriver(tmp)
    applyMigrations(db, loadMigrations(migrationsDir))
    const search = new Fts5SearchIndex(db)
    const store = new SqliteServidorStore(db, new SqliteExecutor(db), search)
    const mid = crearServidor(store, new StaticBearerVerifier(TOKEN), '0.1.0-sync')
    const server: Server = createServer((req, res) => void mid(req, res))
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
  })

  afterAll(() => closeServer())

  it('offline: las contribuciones se encolan localmente y no se pierden sin red', async () => {
    const outbox = new SqliteOutboxRepository(new NodeSqliteDriver(':memory:'))
    const entrada = crearOutboxEntry(
      { tipo: 'nota', entidad: 'device:cisco-catalyst-9300-48p', autor: 'usuario-x', payload: { nota: 'cableado: CR negra' }, revision: 1 },
      'offline-1',
      '2025-03-01T08:00:00.000Z',
    )
    await outbox.enqueue(entrada)
    expect((await outbox.pendientes()).length).toBe(1)

    // Servidor inalcanzable (fetch que falla): sincronizar NO lanza sobre la
    // cola; la deja intacta para el siguiente ciclo.
    const servidorCaido = new HttpSyncServer('http://127.0.0.1:1', TOKEN, async () => {
      throw new Error('red no disponible')
    })
    const replica = new SqliteReplicaRepository(new NodeSqliteDriver(':memory:'))
    const resultado = await sincronizar(outbox, servidorCaido, replica)
    expect(resultado.contribucionesEnviadas).toBe(0)
    expect(resultado.contribucionesPendientes).toBe(1)
    expect((await outbox.pendientes()).length).toBe(1)
  })

  it('recupera la red: pull del snapshot + push del outbox → cola vacía y réplica poblada', async () => {
    const outbox = new SqliteOutboxRepository(new NodeSqliteDriver(':memory:'))
    const replica = new SqliteReplicaRepository(new NodeSqliteDriver(':memory:'))

    const e1 = crearOutboxEntry(
      { tipo: 'propuesta-correccion', entidad: 'device:cisco-catalyst-9300-48p', autor: 'usuario-x', payload: { campo: 'name', valor: '… v2' }, revision: 1 },
      'sync-a',
      '2025-03-01T09:00:00.000Z',
    )
    const e2 = crearOutboxEntry(
      { tipo: 'nota', entidad: 'device:aruba-2930f-48g-poeplus', autor: 'usuario-x', payload: { nota: 'revisar PoE' }, revision: 2 },
      'sync-b',
      '2025-03-01T09:05:00.000Z',
    )
    await outbox.enqueue(e1)
    await outbox.enqueue(e2)
    expect((await outbox.pendientes()).length).toBe(2)

    const servidor = new HttpSyncServer(base, TOKEN)
    const resultado = await sincronizar(outbox, servidor, replica)
    console.log('[debug-sync] resultado:', JSON.stringify(resultado))

    expect(resultado.contribucionesEnviadas).toBe(2)
    expect(resultado.contribucionesPendientes).toBe(0)
    // El snapshot del servidor pobló la réplica con dispositivos reales.
    expect(await replica.count()).toBeGreaterThan(0)
    // LWW: la última revisión se convierte en la versión de la réplica.
    expect(resultado.versionReplica).toBeGreaterThanOrEqual(2)
  })

  it('sin credenciales el push falla y la cola permanece (seguridad §22.5)', async () => {
    const outbox = new SqliteOutboxRepository(new NodeSqliteDriver(':memory:'))
    const replica = new SqliteReplicaRepository(new NodeSqliteDriver(':memory:'))
    const e = crearOutboxEntry(
      { tipo: 'nota', entidad: 'device:x', autor: 'u', payload: { nota: 'n' }, revision: 1 },
      'sync-sin-token',
      '2025-03-01T10:00:00.000Z',
    )
    await outbox.enqueue(e)

    // Token erróneo → el servidor responde 401 → sincronizar no marca enviada.
    const servidorMalo = new HttpSyncServer(base, 'token-invalido')
    const resultado = await sincronizar(outbox, servidorMalo, replica)
    expect(resultado.contribucionesEnviadas).toBe(0)
    expect(resultado.contribucionesPendientes).toBe(1)
  })
})