import { describe, expect, it, beforeAll } from 'vitest'
import { NodeSqliteDriver, CatalogDao, SqliteReconciliationRepository, applyMigrations, loadMigrations, SqliteQualityRepository } from '@netatlas/data'
import { parseYaml, parseXml, parseJson, runImport, normalizar, reconciliar } from '../src/index.js'
import type { ImportDeps } from '../src/index.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'migrations')

function migrado(): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(':memory:')
  applyMigrations(driver, loadMigrations(migrationsDir))
  return driver
}

function depsDe(driver: NodeSqliteDriver): ImportDeps {
  return { driver, knownProtocols: new Set(['ospf']), knownStandards: new Set(['ieee/802.3at']), knownMedia: new Set(['utp-cat6a']) }
}

describe('Importadores XML/YAML (NET-HW-046)', () => {
  it('parsea un lote YAML con alias de campos en castellano', () => {
    const yaml = `
dispositivos:
  - nombre: Switch Madrid-L2
    fabricante: cisco
    categoria: CAT-SWT-L2
    modelo: WS-C2960X
    estado: current
    puertos:
      - etiqueta: 48x 1G
        interfaz: rj45
        cantidad: 48
        velocidades: "1000"
`
    const res = parseYaml(yaml, 'lote.yaml')
    expect(res.errors).toEqual([])
    expect(res.records).toHaveLength(1)
    const d = res.records[0]!.device
    expect(d.name).toBe('Switch Madrid-L2')
    expect(d.manufacturerSlug).toBe('cisco')
    expect(d.categoryCode).toBe('CAT-SWT-L2')
    expect(d.lifecycleStatus).toBe('current')
    expect(d.ports?.[0]?.speedsMbps).toEqual([1000])
    expect(d.ports?.[0]?.quantity).toBe(48)
  })

  it('parsea un lote XML (<catalogo><dispositivo>…)</catalogo></dispositivo>)', () => {
    const xml = `
<catalogo>
  <dispositivo>
    <name>Router Edge</name>
    <manufacturer>mikrotik</manufacturer>
    <category>CAT-RTR</category>
    <lifecycle_status>current</lifecycle_status>
  </dispositivo>
  <dispositivo>
    <name>Firewall North</name>
    <manufacturer>fortinet</manufacturer>
    <category>CAT-SEC</category>
    <status>current</status>
  </dispositivo>
</catalogo>`
    const res = parseXml(xml, 'lote.xml')
    expect(res.errors).toEqual([])
    expect(res.records).toHaveLength(2)
    expect(res.records[0]!.device.name).toBe('Router Edge')
    expect(res.records[1]!.device.manufacturerSlug).toBe('fortinet')
  })

  it('rechaza YAML sin fabricante con razón', () => {
    const res = parseYaml('dispositivos:\n  - nombre: Huerfano\n    categoria: CAT-SWT\n', 'mal.yaml')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]!.message).toMatch(/fabricante/i)
  })
})

describe('Criterio F6 — lote externo sin SQL a mano (dedup + cola)', () => {
  let driver: NodeSqliteDriver

  beforeAll(() => {
    driver = migrado()
    const dao = new CatalogDao(driver)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
    dao.upsertDevice({ slug: 'acme-sw-1000', name: 'Acme Switch 1000', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
  })

  it('altas nuevas + conflicto en cola con diff + fusión automática, sin SQL manual', async () => {
    const driver2 = migrado()
    const dao = new CatalogDao(driver2)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
    dao.upsertDevice({ slug: 'acme-sw-1000', name: 'Acme Switch 1000', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current', model: 'SW-1000', sku: 'SW-1000' })
    dao.upsertDevice({ slug: 'acme-sw-2000', name: 'Acme Switch 2000', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current', model: 'SW-2000', sku: 'SW-2000-X' })
    dao.upsertSource({ slug: 'ext', kind: 'terceros', title: 'Lote externo', authorityLevel: 3 })

    // Lote externo YAML: 1 duplicado exacto (fusión), 1 candidato a revisión, 1 alto nuevo
    const lote = `
dispositivos:
  - name: Acme Switch 1000         # duplicado del existente (mismo modelo+sku) → fusión automática
    manufacturer: acme
    category: CAT-SWT
    model: SW-1000
    sku: SW-1000
    estado: current
  - name: Acme Switch 2000 PRO     # candidato a revisión contra acme-sw-2000 (sku distinto)
    manufacturer: acme
    category: CAT-SWT
    model: SW-2000
    sku: SW-2000-PRO
    estado: current
  - name: Acme Switch 3000         # alto nuevo
    manufacturer: acme
    category: CAT-SWT
    model: SW-3000
    estado: current
`
    const parsed = parseYaml(lote, 'lote-externo.yaml')
    expect(parsed.errors).toEqual([])

    const cola = new SqliteReconciliationRepository(driver2)
    const report = runImport(parsed.records, depsDe(driver2), {
      onConflicto: (c) => void cola.crear({ entradaSlug: c.entradaSlug, existenteSlug: c.existenteSlug, score: c.score, diff: c.diff }),
    })

    expect(report.conflictos).toBe(1)
    expect(report.conflictosDetalle[0]?.existenteSlug).toBe('acme-sw-2000')
    expect(report.conflictosDetalle[0]?.score).toBeGreaterThanOrEqual(0.7)
    // La cola recibió el candidato
    expect(await cola.contarPendientes()).toBe(1)
    const pendiente = (await cola.pendientes())[0]!
    expect(pendiente.diff[0]?.campo).toBe('name')

    // Se persistieron 2 (fusión del duplicado como actualización de sw-1000 + alto sw-3000);
    // el candidato sw-2000PRO quedó fuera (conflicto a revisión)
    expect(report.altas).toBe(1)
    expect(report.actualizaciones).toBe(1)
    expect(report.sinCambio).toBe(0)
    expect(dao.deviceId('acme-acme-switch-3000')).toBeDefined()
    // El duplicado se fusionó actualizando el existente (name del lote)
    const nombre = driver2.prepare("SELECT name FROM device WHERE slug = 'acme-sw-1000'").get() as { name: string }
    expect(nombre.name).toBe('Acme Switch 1000')
    // El candidato a revisión NO se persistió bajo su slug derivado
    expect(dao.deviceId('acme-acme-switch-2000-pro')).toBeUndefined()

    // Calidad: cobertura y cola visible desde el dashboard
    const calidad = new SqliteQualityRepository(driver2).qualityReport()
    expect(calidad.reconciliacionesPendientes).toBe(1)
    expect(calidad.dispositivos).toBe(3) // sw-1000, sw-2000, sw-3000
  })
})