import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { NodeSqliteDriver, loadMigrations, applyMigrations, CatalogDao } from '@netatlas/data'
import { Fts5SearchIndex } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', '..', 'data', 'migrations')

describe('Fts5SearchIndex', () => {
  let driver: NodeSqliteDriver
  let search: Fts5SearchIndex

  beforeAll(() => {
    driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const dao = new CatalogDao(driver)
    dao.upsertManufacturer({ slug: 'aruba', name: 'Aruba Networks' })
    dao.upsertManufacturer({ slug: 'cisco', name: 'Cisco Systems' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['switch'] })
    dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'Switch gestionable L2', aliases: ['sw-l2'] })
    dao.upsertCategory({ code: 'CAT-RTR', nameEs: 'Routing', aliases: ['router'] })

    dao.upsertDevice({
      slug: 'aruba-2930f-48g',
      name: 'Aruba 2930F 48G PoE+ 4SFP+ Switch',
      manufacturerSlug: 'aruba',
      categoryCode: 'CAT-SWT-L2',
      lifecycleStatus: 'mature',
    })
    dao.addPort({
      deviceSlug: 'aruba-2930f-48g',
      interfaceCode: 'rj45',
      label: '48x 1G RJ45',
      quantity: 48,
      speedsMbps: [1000],
      role: 'access',
    })
    dao.addPort({
      deviceSlug: 'aruba-2930f-48g',
      interfaceCode: 'sfp-plus',
      label: '4x SFP+',
      quantity: 4,
      speedsMbps: [10000],
      role: 'uplink',
    })

    dao.upsertDevice({
      slug: 'cisco-isr4321',
      name: 'Cisco ISR 4321 Router',
      manufacturerSlug: 'cisco',
      categoryCode: 'CAT-RTR',
      lifecycleStatus: 'current',
    })

    search = new Fts5SearchIndex(driver)
  })

  it('busca por término con FTS5 (diacríticos insensibles)', async () => {
    const res = await search.query({ rawQuery: '2930f', limit: 10 })
    expect(res.total).toBe(1)
    expect(res.hits[0]?.slug).toBe('aruba-2930f-48g')
  })

  it('busca con prefijo e ignora mayúsculas', async () => {
    const res = await search.query({ rawQuery: 'CISCO', limit: 10 })
    expect(res.hits.some((h) => h.slug === 'cisco-isr4321')).toBe(true)
  })

  it('devuelve facetas agregadas', async () => {
    const res = await search.query({ rawQuery: '', limit: 10 })
    expect(res.total).toBe(2)
    const cat = res.facets.category
    expect(cat.find((f) => f.value === 'Switch gestionable L2')?.count).toBe(1)
    const status = res.facets.lifecycleStatus
    expect(status.find((f) => f.value === 'mature')?.count).toBe(1)
  })

  it('aplica filtros de faceta', async () => {
    const res = await search.query({ rawQuery: '', limit: 10, facetFilters: { manufacturer: ['aruba'] } })
    expect(res.total).toBe(1)
    expect(res.hits[0]?.slug).toBe('aruba-2930f-48g')
  })

  it('sugiere autocompletado', async () => {
    const sugg = await search.suggest('aruba', 5)
    expect(sugg.length).toBe(1)
    expect(sugg[0]?.slug).toBe('aruba-2930f-48g')
  })

  it('busca por velocidad máxima soportada (10 Gbps)', async () => {
    const { Speed } = await import('@netatlas/domain')
    const res = await search.byMaxSpeed(Speed.gbps(10), { rawQuery: '', limit: 10 })
    expect(res.hits.map((h) => h.slug)).toContain('aruba-2930f-48g')
    expect(res.hits.map((h) => h.slug)).not.toContain('cisco-isr4321')
  })
})