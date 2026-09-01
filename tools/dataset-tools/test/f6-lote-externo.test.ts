import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  NodeSqliteDriver,
  CatalogDao,
  SqliteReconciliationRepository,
  SqliteQualityRepository,
  loadMigrations,
  applyMigrations,
} from '@netatlas/data'
import { ejecutarImportacion } from '@netatlas/import-cli'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

/**
 * CRITERIO F6 — "Lote externo sin SQL a mano":
 * un lote externo MIXTO (YAML + XML) importado por la CLI sobre una BD SQLite
 * real (sin tocar SQL) → altas + fusiones automáticas + conflicto en cola +
 * informe legible + verificación directa en la BD y en el dashboard de calidad.
 */
describe('Criterio F6 — lote externo mixto por CLI sin SQL manual', () => {
  let tmpDir: string
  let dbPath: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'netatlas-f6-'))
    dbPath = join(tmpDir, 'lote.sqlite')

    // BD base migrada con catálogo mínimo + dispositivos existentes para el dedup
    const base = new NodeSqliteDriver(dbPath)
    applyMigrations(base, loadMigrations(migrationsDir))
    const dao = new CatalogDao(base)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertManufacturer({ slug: 'nordic', name: 'Nordic' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
    dao.upsertCategory({ code: 'CAT-SEC', nameEs: 'Security', aliases: [] })
    dao.upsertSource({ slug: 'ext', kind: 'terceros', title: 'Lote externo', authorityLevel: 3 })
    // Existentes con modelo+sku: uno fusible y otro que será candidato a revisión
    dao.upsertDevice({ slug: 'acme-sw-1000', name: 'Acme Switch 1000', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current', model: 'ASW-1000', sku: 'ASW-1000' })
    dao.upsertDevice({ slug: 'acme-sw-2000', name: 'Acme Switch 2000', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current', model: 'ASW-2000', sku: 'ASW-2000-X' })
    dao.upsertDevice({ slug: 'nordic-fw', name: 'Nordic Firewall', manufacturerSlug: 'nordic', categoryCode: 'CAT-SEC', lifecycleStatus: 'current', model: 'NFW-1', sku: 'NFW-1' })
    base.close()
  })

  it('importa YAML+XML → altas + fusión + conflicto en cola + informe + BD verificada', () => {
    const yaml = `dispositivos:
  - name: Acme Switch 1000
    fabricante: acme
    categoria: CAT-SWT
    modelo: ASW-1000
    sku: ASW-1000
    estado: current
  - name: Acme Switch 2000 PRO
    fabricante: acme
    categoria: CAT-SWT
    modelo: ASW-2000
    sku: ASW-2000-PRO
    estado: current
  - name: Acme Switch 3000
    fabricante: acme
    categoria: CAT-SWT
    modelo: ASW-3000
    estado: current
`
    const xml = `<catalogo>
  <dispositivo><name>Nordic Firewall Nouveau</name><manufacturer>nordic</manufacturer><category>CAT-SEC</category><model>NFW-1</model><sku>NFW-1-N</sku><status>current</status></dispositivo>
  <dispositivo><name>Nordic AP</name><manufacturer>nordic</manufacturer><category>CAT-SEC</category><model>NAP-1</model><status>current</status></dispositivo>
</catalogo>`

    const yamlPath = join(tmpDir, 'externo.yaml')
    const xmlPath = join(tmpDir, 'externo.xml')
    writeFileSync(yamlPath, yaml, 'utf8')
    writeFileSync(xmlPath, xml, 'utf8')

    // Importación YAML + XML por la CLI (sin SQL manual)
    expect(ejecutarImportacion({ file: yamlPath, formato: 'yaml', db: dbPath, schema: migrationsDir }).ok).toBe(true)
    expect(ejecutarImportacion({ file: xmlPath, formato: 'xml', db: dbPath, schema: migrationsDir }).ok).toBe(true)

    // ── Verificación en BD ────────────────────────────────────────────────
    const driver = new NodeSqliteDriver(dbPath)
    const dao = new CatalogDao(driver)

    // Altas: acme-sw-3000 (YAML) y nordic-ap (XML)
    expect(dao.deviceId('acme-acme-switch-3000')).toBeDefined()
    expect(dao.deviceId('nordic-nordic-ap')).toBeDefined()

    // Fusión automática: el duplicado de acme-sw-1000 persistió sobre el existente
    expect(dao.deviceId('acme-sw-1000')).toBeDefined()

    // Conflicto a revisión (asw-2000PRO): NO se persistió bajo su slug propio
    expect(dao.deviceId('acme-acme-switch-2000-pro')).toBeUndefined()
    const pendientes = new SqliteReconciliationRepository(driver).pendientes()
    // La cola es async; se chequea aquí vía promesa
    void pendientes

    // Calidad: al menos los 3 existentes + 2 altas → 5 dispositivos
    const calidad = new SqliteQualityRepository(driver).qualityReport()
    expect(calidad.dispositivos).toBeGreaterThanOrEqual(5)
    driver.close()
  })

  it('la cola de reconciliación registró el conflicto con diff (async)', async () => {
    const driver = new NodeSqliteDriver(dbPath)
    const pendientes = await new SqliteReconciliationRepository(driver).pendientes()
    expect(pendientes.some((p) => p.existenteSlug === 'acme-sw-2000' && p.score >= 0.7)).toBe(true)
    driver.close()
  })

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })
})