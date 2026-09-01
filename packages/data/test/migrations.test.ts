import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { loadMigrations, applyMigrations, NodeSqliteDriver, CatalogDao } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')

describe('Migraciones (0001_init + 0002_reconciliation)', () => {
  let driver: NodeSqliteDriver

  beforeAll(() => {
    driver = new NodeSqliteDriver(':memory:')
    const migrations = loadMigrations(migrationsDir)
    const result = applyMigrations(driver, migrations)
    expect(result.applied).toContain(1)
    expect(result.applied).toContain(2)
  })

  it('aplica las migraciones y registra la última versión', () => {
    const row = driver.prepare('SELECT MAX(version) AS v FROM schema_version').get()
    expect(Number(row?.v)).toBe(2)
  })

  it('re-aplicar es idempotente (skipped, sin error)', () => {
    const migrations = loadMigrations(migrationsDir)
    const second = applyMigrations(driver, migrations)
    expect(second.applied).toHaveLength(0)
    expect(second.skipped).toContain(1)
    expect(second.skipped).toContain(2)
  })

  it('crea todas las tablas núcleo del modelo', () => {
    const required = [
      'manufacturer', 'product_family', 'category', 'device',
      'interface', 'port', 'attribute_definition', 'device_attribute',
      'predicate', 'relationship', 'source', 'assertion',
      'protocol', 'standard', 'medium', 'technology', 'speed_grade',
      'osi_layer', 'tcpip_layer', 'component', 'device_component',
      'firmware', 'power_spec', 'image', 'datasheet', 'glossary_term',
      'topology', 'topology_node', 'topology_edge', 'entity_history',
      'reference', 'import_batch', 'schema_version',
    ]
    const rows = driver.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all()
    const names = rows.map((r) => String(r.name))
    for (const table of required) {
      expect(names).toContain(table)
    }
  })

  it('cataloga las vistas de proyección del grafo', () => {
    const rows = driver.prepare(
      "SELECT name FROM sqlite_master WHERE type='view'",
    ).all()
    const names = rows.map((r) => String(r.name))
    for (const view of ['v_device', 'v_device_protocols', 'v_device_standards', 'v_genealogy']) {
      expect(names).toContain(view)
    }
  })

  it('expone FTS5 con tokenizer unicode61 y diacríticos removidos', () => {
    const row = driver
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fts_device'")
      .get()
    expect(String(row?.sql)).toContain('fts5')
    expect(String(row?.sql)).toContain('remove_diacritics 2')
  })

  it('sincroniza fts_device mediante triggers (insert)', async () => {
    const dao = new CatalogDao(driver)
    dao.upsertManufacturer({ slug: 'aruba', name: 'Aruba Networks' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['switch'] })
    dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'Switch gestionable L2', aliases: ['sw-l2'] })
    dao.upsertDevice({
      slug: 'aruba-2930f-48g',
      name: 'Aruba 2930F 48G 4SFP+',
      manufacturerSlug: 'aruba',
      categoryCode: 'CAT-SWT-L2',
      lifecycleStatus: 'mature',
    })

    const hit = driver
      .prepare("SELECT rowid FROM fts_device WHERE fts_device MATCH '2930F'")
      .get()
    expect(hit).toBeDefined()
  })

  it('garantiza cardinalidad one mediante índice parcial', () => {
    const rows = driver.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_rel_one_current'").all()
    expect(rows).toHaveLength(1)
    expect(String(rows[0]!.sql)).toContain('WHERE valid_to IS NULL')
  })
})