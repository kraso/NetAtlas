import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  NodeSqliteDriver,
  CatalogDao,
  SqliteTopologyRepository,
  applyMigrations,
  loadMigrations,
} from '../src/index.js'
import { Topology } from '@netatlas/domain'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')

describe('SqliteTopologyRepository (F4 / §13.3)', () => {
  let repo: SqliteTopologyRepository

  beforeAll(() => {
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const dao = new CatalogDao(driver)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
    dao.upsertDevice({ slug: 'sw-1', name: 'Switch 1', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
    dao.upsertDevice({ slug: 'rtr-1', name: 'Router 1', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
    repo = new SqliteTopologyRepository(driver)
  })

  it('upsert + bySlug + list hacen el roundtrip completo (nodos y aristas)', async () => {
    const t = Topology.create({
      slug: 'sucursal-test',
      name: 'Sucursal de prueba',
      kind: 'reference',
      nodes: [
        { entityType: 'device', entitySlug: 'rtr-1', x: 10, y: 20 },
        { entityType: 'device', entitySlug: 'sw-1', x: 30, y: 40, layerHint: 2 },
      ],
      edges: [{ from: 'device:rtr-1', to: 'device:sw-1', label: 'uplink 1G' }],
      metadata: { autor: 'test' },
    })
    await repo.upsert(t)

    const cargada = await repo.bySlug('sucursal-test')
    expect(cargada?.name).toBe('Sucursal de prueba')
    expect(cargada?.kind).toBe('reference')
    expect(cargada?.nodes.length).toBe(2)
    expect(cargada?.nodeById('device:rtr-1')?.x).toBe(10)
    expect(cargada?.nodeById('device:sw-1')?.y).toBe(40)
    expect(cargada?.nodeById('device:sw-1')?.layerHint).toBe(2)
    expect(cargada?.edges.length).toBe(1)
    expect(cargada?.edges[0]?.label).toBe('uplink 1G')
    expect(cargada?.metadata).toEqual({ autor: 'test' })

    const lista = await repo.list()
    expect(lista.map((x) => x.slug.value)).toContain('sucursal-test')
  })

  it('saveLayout persiste solo las coordenadas', async () => {
    await repo.saveLayout('sucursal-test', [
      { nodeId: 'device:rtr-1', x: 111, y: 222 },
      { nodeId: 'device:sw-1', x: 333, y: 444 },
    ])
    const cargada = await repo.bySlug('sucursal-test')
    expect(cargada?.nodeById('device:rtr-1')?.x).toBe(111)
    expect(cargada?.nodeById('device:sw-1')?.y).toBe(444)
    expect(cargada?.edges.length).toBe(1) // las aristas no se tocan
  })

  it('upsert idempotente reemplaza el contenido previo', async () => {
    const v2 = Topology.create({
      slug: 'sucursal-test',
      name: 'Sucursal v2',
      kind: 'reference',
      nodes: [{ entityType: 'device', entitySlug: 'sw-1' }],
      edges: [],
    })
    await repo.upsert(v2)
    const cargada = await repo.bySlug('sucursal-test')
    expect(cargada?.name).toBe('Sucursal v2')
    expect(cargada?.nodes.length).toBe(1)
  })

  it('remove elimina la topología y sus nodos', async () => {
    await repo.remove('sucursal-test')
    expect(await repo.bySlug('sucursal-test')).toBeUndefined()
    const lista = await repo.list()
    expect(lista.map((x) => x.slug.value)).not.toContain('sucursal-test')
  })
})