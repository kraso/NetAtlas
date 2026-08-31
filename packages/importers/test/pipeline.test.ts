import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeSqliteDriver, applyMigrations, loadMigrations, CatalogDao } from '@netatlas/data'
import { parseJson, parseCsv, runImport, normalizar, validar, agruparDuplicados } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', '..', 'data', 'migrations')

function nuevoDriver(): { driver: NodeSqliteDriver; dao: CatalogDao } {
  const driver = new NodeSqliteDriver(':memory:')
  applyMigrations(driver, loadMigrations(migrationsDir))
  const dao = new CatalogDao(driver)
  // Catálogo cerrado mínimo para la validación
  dao.upsertManufacturer({ slug: 'acme', name: 'Acme Networks' })
  dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
  dao.upsertSource({ slug: 's1', kind: 'datasheet', title: 'Datasheet', authorityLevel: 1 })
  // Predicados canónicos del catálogo cerrado (obligatorio por FK de relationship)
  dao.seedPredicates([
    { code: 'manufactured-by', domain: ['device'], range: ['manufacturer'], cardinality: 'one' },
    { code: 'has-category', domain: ['device'], range: ['category'], cardinality: 'one' },
    { code: 'supports-protocol', domain: ['device'], range: ['protocol'] },
    { code: 'operates-at-layer', domain: ['device', 'category'], range: ['layer'] },
  ] as never)
  return { driver, dao }
}

function depsDe(driver: NodeSqliteDriver) {
  return {
    driver,
    knownProtocols: new Set(['ospf', 'bgp', 'vxlan', 'ipv6']),
    knownMedia: new Set(['mmf-om3', 'smf-os2']),
  }
}

const portJson = (qty: number): string =>
  JSON.stringify([{ label: `${qty}x 1G`, interfaceCode: 'rj45', quantity: qty, speedsMbps: [1000] }]).replace(/"/g, '""')

const csvValido = `name,manufacturerSlug,categoryCode,lifecycleStatus,model,portsJson
"Switch A",acme,CAT-SWT,current,SW-1,"${portJson(24)}"
"Switch B",acme,CAT-SWT,current,SW-2,"${portJson(48)}"`

describe('parseJson', () => {
  it('parsea un array y un envoltorio {devices}', () => {
    const directa = parseJson('[{"name":"A","manufacturerSlug":"acme","categoryCode":"CAT-SWT"}]')
    expect(directa.records).toHaveLength(1)
    expect(directa.errors).toHaveLength(0)

    const envuelta = parseJson('{"devices":[{"name":"B","manufacturerSlug":"acme","categoryCode":"CAT-SWT"}]}')
    expect(envuelta.records).toHaveLength(1)
  })

  it('reporta errores por registro sin abortar el resto', () => {
    const res = parseJson('[{"name":"OK","manufacturerSlug":"acme","categoryCode":"CAT-SWT"},{"name":"","manufacturerSlug":"acme","categoryCode":"CAT-SWT"}]')
    expect(res.records).toHaveLength(1)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]!.message).toContain('name')
  })
})

describe('parseCsv', () => {
  it('parsea cabecera + filas con JSON de puertos embebido', () => {
    const res = parseCsv(csvValido)
    expect(res.errors).toHaveLength(0)
    expect(res.records).toHaveLength(2)
    expect(res.records[0]!.device.model).toBe('SW-1')
    expect(res.records[0]!.device.ports?.[0]?.quantity).toBe(24)
  })

  it('rechaza filas incompletas con la línea exacta', () => {
    const res = parseCsv('name,manufacturerSlug,categoryCode\n"X",acme,CAT-SWT\n"Y",acme\n')
    expect(res.records).toHaveLength(1)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]!.record).toBe(3) // línea 3
  })
})

describe('normalizar / validar', () => {
  it('normaliza slugs y fabricantes', () => {
    const res = parseJson('[{"name":"Mi Switch Pro","manufacturerSlug":"Acme Networks","categoryCode":"CAT-SWT"}]')
    const norm = normalizar(res.records)
    expect(norm[0]!.device.slug).toBe('acme-networks-mi-switch-pro')
    expect(norm[0]!.device.manufacturerSlug).toBe('acme-networks')
  })

  it('valida estados y catálogos cerrados', () => {
    const res = parseJson(
      '[{"name":"A","manufacturerSlug":"acme","categoryCode":"CAT-SWT","lifecycleStatus":"inventado","relationships":[{"predicate":"supports-protocol","objectType":"protocol","objectSlug":"noexiste"}]}]',
    )
    const { driver } = nuevoDriver()
    const { validos, issues } = validar(normalizar(res.records), depsDe(driver))
    expect(validos).toHaveLength(0)
    expect(issues.some((i) => i.rule === 'lifecycle')).toBe(true)
    expect(issues.some((i) => i.rule === 'closed-catalog')).toBe(true)
  })
})

describe('runImport — criterio 28.1.6#5 (lote con 5% corruptos)', () => {
  it('importa 100% de un lote válido y reporta altas', () => {
    const { driver } = nuevoDriver()
    const devices = Array.from({ length: 20 }, (_, i) => ({
      name: `Switch-${i}`,
      manufacturerSlug: 'acme',
      categoryCode: 'CAT-SWT',
      lifecycleStatus: 'current',
      slug: `switch-${i}`,
      assertions: [{ predicate: 'supports-protocol', value: 'ospf', sourceSlug: 's1', confidence: 'official' }],
    }))
    const res = parseJson(JSON.stringify(devices))
    const report = runImport(res.records, depsDe(driver))
    expect(report.altas).toBe(20)
    expect(report.rechazos).toBe(0)
    expect(report.validaciones).toHaveLength(0)
    const count = driver.prepare('SELECT COUNT(*) AS c FROM device').get()
    expect(Number(count?.c)).toBe(20)
  })

  it('rechaza registros corruptos con razón exacta y mantiene intactos los válidos', () => {
    const { driver } = nuevoDriver()
    const devices = Array.from({ length: 20 }, (_, i) => ({
      name: `Switch-${i}`,
      manufacturerSlug: 'acme',
      categoryCode: 'CAT-SWT',
      lifecycleStatus: 'current',
      slug: `switch-${i}`,
    }))
    // 1 de 20 corrupto (5%): estado inválido → debe rechazarse con razón y el resto persistir
    devices[10] = { ...devices[10]!, lifecycleStatus: 'retirado-por-nerd' }
    const res = parseJson(JSON.stringify(devices))
    const report = runImport(res.records, depsDe(driver))
    expect(report.rechazos).toBe(1)
    expect(report.altas).toBe(19)
    const reason = report.validaciones.find((v) => v.rule === 'lifecycle')
    expect(reason).toBeDefined()
    expect(reason!.message).toContain('retirado-por-nerd')
    // El registro corrupto NO está en la BD
    const corrupt = driver.prepare('SELECT COUNT(*) AS c FROM device WHERE slug = ?').get('switch-10')
    expect(Number(corrupt?.c)).toBe(0)
    // Los válidos sí (incluido el 19 restante)
    const ok = driver.prepare('SELECT COUNT(*) AS c FROM device WHERE slug IN (?)').get('switch-19')
    expect(Number(ok?.c)).toBe(1)
  })
})

describe('dedup', () => {
  it('agrupa por manufacturer+model', () => {
    const res = parseJson(JSON.stringify([
      { name: 'M1', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', model: 'X300' },
      { name: 'M1-C', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', model: 'X300' },
      { name: 'Otra', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', model: 'Y100' },
    ]))
    const grupos = agruparDuplicados(normalizar(res.records))
    expect(grupos.size).toBe(2)
    const modeloX = [...grupos.values()].find((g) => g[0]!.device.model === 'X300')
    expect(modeloX).toHaveLength(2)
  })
})