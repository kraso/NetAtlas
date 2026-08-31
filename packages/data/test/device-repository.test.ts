import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  composeRuntime,
  disposeRuntime,
  CatalogDao,
  NodeSqliteDriver,
  applyMigrations,
  loadMigrations,
} from '../src/index.js'
import { Device, Port, OsiProfileValue } from '@netatlas/domain'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeContext } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')

function seededContext(): { ctx: RuntimeContext; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'netatlas-repo-'))
  const driver = new NodeSqliteDriver(':memory:')
  applyMigrations(driver, loadMigrations(migrationsDir))
  const dao = new CatalogDao(driver)

  dao.upsertManufacturer({ slug: 'aruba', name: 'Aruba Networks' })
  dao.upsertManufacturer({ slug: 'cisco', name: 'Cisco Systems' })
  dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['switch'] })
  dao.upsertCategory({ code: 'CAT-SWT-HUB', parentCode: 'CAT-SWT', nameEs: 'Hubs', aliases: ['hub'] })
  dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'Switches capa 2', aliases: ['sw-l2'] })
  dao.upsertCategory({ code: 'CAT-SWT-L3', parentCode: 'CAT-SWT', nameEs: 'Switches multilayer L3', aliases: ['sw-l3'] })
  dao.upsertCategory({ code: 'CAT-RTR', nameEs: 'Routing', aliases: ['router'] })
  dao.upsertCategory({ code: 'CAT-RTR-ENT', parentCode: 'CAT-RTR', nameEs: 'Routers empresariales', aliases: [] })

  const seedDevices = [
    { slug: 'aruba-2930f-48g-poeplus', name: 'Aruba 2930F 48G PoE+', manufacturerSlug: 'aruba', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'mature' },
    { slug: 'cisco-catalyst-3850', name: 'Cisco Catalyst 3850', manufacturerSlug: 'cisco', categoryCode: 'CAT-SWT-L3', lifecycleStatus: 'current' },
    { slug: '3com-hub-8', name: '3Com Hub 8', manufacturerSlug: 'cisco', categoryCode: 'CAT-SWT-HUB', lifecycleStatus: 'legacy' },
    { slug: 'cisco-isr-4321', name: 'Cisco ISR 4321', manufacturerSlug: 'cisco', categoryCode: 'CAT-RTR-ENT', lifecycleStatus: 'current' },
  ]
  for (const d of seedDevices) dao.upsertDevice(d)
  dao.addPort({
    deviceSlug: 'aruba-2930f-48g-poeplus',
    interfaceCode: 'rj45',
    label: '48x 1G',
    quantity: 48,
    speedsMbps: [1000],
    role: 'access',
  })
  dao.addPort({
    deviceSlug: 'aruba-2930f-48g-poeplus',
    interfaceCode: 'sfp-plus',
    label: '4x SFP+',
    quantity: 4,
    speedsMbps: [10000],
    role: 'uplink',
  })
  dao.seedPredicates([
    { code: 'manufactured-by', domain: ['device'], range: ['manufacturer'], cardinality: 'one' },
    { code: 'has-category', domain: ['device'], range: ['category'], cardinality: 'one' },
    { code: 'succeeds', domain: ['device'], range: ['device'], acyclic: true, inverse: 'precedes' },
    { code: 'replaced-by', domain: ['device'], range: ['device'], acyclic: true },
  ] as never)
  dao.addRelationship({
    subjectType: 'device',
    subjectId: dao.deviceId('aruba-2930f-48g-poeplus')!,
    predicate: 'succeeds',
    objectType: 'device',
    objectId: dao.deviceId('3com-hub-8')!,
  })

  const ctx = composeRuntime({ migrationsDir, path: ':memory:', driver, applyMigrationsFirst: false })
  return { ctx, tmp }
}

describe('SqliteDeviceRepository / CatalogRepository', () => {
  let fixture: { ctx: RuntimeContext; tmp: string }

  beforeAll(() => {
    fixture = seededContext()
    return () => {
      disposeRuntime(fixture.ctx)
      rmSync(fixture.tmp, { recursive: true, force: true })
    }
  })

  it('encuentra dispositivo por slug con puertos', async () => {
    const d = await fixture.ctx.repositories.device.findBySlug('aruba-2930f-48g-poeplus')
    expect(d).toBeDefined()
    expect(d!.manufacturerSlug).toBe('aruba')
    expect(d!.categoryCode).toBe('CAT-SWT-L2')
    expect(d!.ports.length).toBe(2)
  })

  it('listByCategory incluye subcategorías vía CTE (cat:sw → hub+l2+l3)', async () => {
    const page = await fixture.ctx.repositories.device.listByCategory('CAT-SWT', { limit: 50 })
    const slugs = page.items.map((d) => d.slug.value)
    expect(slugs).toContain('aruba-2930f-48g-poeplus')
    expect(slugs).toContain('cisco-catalyst-3850')
    expect(slugs).toContain('3com-hub-8')
  })

  it('findByManufacturer filtra por fabricante', async () => {
    const page = await fixture.ctx.repositories.device.findByManufacturer('cisco', { limit: 50 })
    expect(page.items.every((d) => d.manufacturerSlug === 'cisco')).toBe(true)
    expect(page.items.length).toBe(3)
  })

  it('count devuelve el total sembrado', async () => {
    expect(await fixture.ctx.repositories.device.count()).toBe(4)
  })

  it('CatalogRepository: fabricante, categoría y listado', async () => {
    const mfr = await fixture.ctx.repositories.catalog.manufacturerBySlug('aruba')
    expect(mfr?.name).toContain('Aruba')
    const cat = await fixture.ctx.repositories.catalog.categoryByCode('CAT-SWT-L2')
    expect(cat?.nameEs).toContain('Switches capa 2')
    const all = await fixture.ctx.repositories.catalog.listCategories()
    expect(all.map((c) => c.code)).toContain('CAT-RTR-ENT')
  })

  it('save persiste un dispositivo nuevo (Device.create)', async () => {
    const nuevo = Device.create({
      slug: 'aruba-6300m',
      name: 'Aruba 6300M 48G',
      manufacturerSlug: 'aruba',
      categoryCode: 'CAT-SWT-L2',
      lifecycleStatus: 'current',
      osiProfile: OsiProfileValue.create({ terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }),
      ports: [
        Port.create({ label: '48x 1G', interfaceCode: 'rj45', quantity: 48, speedsMbps: [1000], role: 'access' }),
      ],
    })
    await fixture.ctx.repositories.device.save(nuevo)
    const leido = await fixture.ctx.repositories.device.findBySlug('aruba-6300m')
    expect(leido).toBeDefined()
    expect(leido!.ports[0]!.quantity).toBe(48)
    expect(await fixture.ctx.repositories.device.count()).toBe(5)
  })
})