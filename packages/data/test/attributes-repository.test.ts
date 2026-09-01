import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeSqliteDriver, CatalogDao, SqliteAttributesRepository, applyMigrations, loadMigrations } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')

describe('SqliteAttributesRepository (EAV §9.4)', () => {
  let repo: SqliteAttributesRepository

  beforeAll(() => {
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const dao = new CatalogDao(driver)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
    dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'L2', aliases: [] })
    dao.upsertDevice({ slug: 'sw-1', name: 'Switch 1', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'current' })
    dao.upsertDevice({ slug: 'sw-2', name: 'Switch 2', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'current' })
    dao.upsertDevice({ slug: 'sw-3', name: 'Switch 3', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'current' })

    // Atributo de la categoría padre (heredable) — faceta número
    dao.defineAttribute({
      categoryCode: 'CAT-SWT',
      key: 'switching_capacity_gbps',
      labelEs: 'Capacidad de conmutación',
      valueType: 'number',
      unit: 'Gbps',
      isFacet: true,
      compareRule: 'higher-better',
    })
    // Atributo de la subcategoría — faceta enum
    dao.defineAttribute({
      categoryCode: 'CAT-SWT-L2',
      key: 'stackable',
      labelEs: 'Apilable',
      valueType: 'enum',
      enumValues: ['sí', 'no'],
      isFacet: true,
      compareRule: 'set-compare',
    })
    // Atributo no facetado (no debe aparecer en facetCounts)
    dao.defineAttribute({
      categoryCode: 'CAT-SWT-L2',
      key: 'nota_interna',
      labelEs: 'Nota interna',
      valueType: 'text',
      isFacet: false,
      compareRule: 'none',
    })

    dao.setDeviceAttribute('sw-1', 'switching_capacity_gbps', 176)
    dao.setDeviceAttribute('sw-2', 'switching_capacity_gbps', 256)
    dao.setDeviceAttribute('sw-3', 'switching_capacity_gbps', 256)
    dao.setDeviceAttribute('sw-1', 'stackable', 'sí')
    dao.setDeviceAttribute('sw-2', 'stackable', 'no')
    dao.setDeviceAttribute('sw-3', 'nota_interna', 'solo interna')

    repo = new SqliteAttributesRepository(driver)
  })

  it('resuelve definiciones heredadas del padre de categoría', async () => {
    const defs = await repo.attributeDefinitionsByCategory('CAT-SWT-L2')
    expect(defs.map((d) => d.key)).toContain('switching_capacity_gbps') // padre
    expect(defs.map((d) => d.key)).toContain('stackable') // propia
    const switching = defs.find((d) => d.key === 'switching_capacity_gbps')
    expect(switching?.isFacet).toBe(true)
    expect(switching?.unit).toBe('Gbps')
  })

  it('lee los valores de atributo de un dispositivo', async () => {
    const values = await repo.attributeValuesForDevice('sw-1')
    expect(values.find((v) => v.key === 'switching_capacity_gbps')?.display).toBe('176')
    expect(values.find((v) => v.key === 'stackable')?.display).toBe('sí')
  })

  it('calcula facetas dinámicas por atributo (conteos)', async () => {
    const caps = await repo.facetCounts('CAT-SWT-L2', 'switching_capacity_gbps')
    expect(caps.find((f) => f.value === '176')?.count).toBe(1)
    expect(caps.find((f) => f.value === '256')?.count).toBe(2)
    const stack = await repo.facetCounts('CAT-SWT-L2', 'stackable')
    expect(stack.find((f) => f.value === 'sí')?.count).toBe(1)
    expect(stack.find((f) => f.value === 'no')?.count).toBe(1)
  })

  it('facetCounts incluye el subárbol (hereda hijos) y omite no facetados', async () => {
    // Consulta desde la categoría padre: los L2 son hijos
    const caps = await repo.facetCounts('CAT-SWT', 'switching_capacity_gbps')
    expect(caps.reduce((s, f) => s + f.count, 0)).toBe(3)
    const internas = await repo.facetCounts('CAT-SWT-L2', 'nota_interna')
    expect(internas).toEqual([])
  })

  it('filterByFacetValues aplica AND entre claves y OR dentro de una clave', async () => {
    const porCapacidad = await repo.filterByFacetValues('CAT-SWT-L2', { switching_capacity_gbps: ['256'] })
    expect(porCapacidad).toEqual(['sw-2', 'sw-3'])
    const porAmbas = await repo.filterByFacetValues('CAT-SWT-L2', { switching_capacity_gbps: ['176'], stackable: ['sí'] })
    expect(porAmbas).toEqual(['sw-1'])
    const porAmbasVacio = await repo.filterByFacetValues('CAT-SWT-L2', { switching_capacity_gbps: ['256'], stackable: ['sí'] })
    expect(porAmbasVacio).toEqual([])
  })
})