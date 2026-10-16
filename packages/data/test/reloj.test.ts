import { describe, expect, it } from 'vitest'
import { applyMigrations, loadMigrations, CatalogDao, NodeSqliteDriver, relojDelSistema, relojFijo } from '../src/index.js'
import type { Clock } from '@netatlas/domain'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * El reloj es la pieza que hace reproducible el dataset: si las marcas de
 * tiempo salen del reloj del sistema, dos builds de las mismas fuentes dan
 * archivos distintos y el `sha256` del manifiesto cambia sin que nadie haya
 * tocado el contenido.
 */

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')
const INSTANTE = '2026-01-02T00:00:00.000Z'

/** Base en memoria con migraciones y catálogo mínimo, con el reloj que se pida. */
function baseConReloj(reloj?: Clock): { driver: NodeSqliteDriver; dao: CatalogDao } {
  const driver = new NodeSqliteDriver(':memory:')
  applyMigrations(driver, loadMigrations(migrationsDir), reloj ?? relojDelSistema)
  const dao = reloj ? new CatalogDao(driver, reloj) : new CatalogDao(driver)
  dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
  dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Conmutadores', aliases: [] })
  return { driver, dao }
}

function sembrarDispositivo(dao: CatalogDao): void {
  dao.seedPredicates([{ code: 'supports-protocol', domain: ['device'], range: ['protocol'] }])
  dao.upsertDevice({ slug: 'sw-1', name: 'Switch 1', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
  dao.upsertDevice({ slug: 'sw-1', name: 'Switch 1 revisado', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
  dao.addRelationship({
    subjectType: 'device',
    subjectId: dao.deviceId('sw-1')!,
    predicate: 'supports-protocol',
    objectType: 'protocol',
    objectId: dao.protocolId('ospf'),
  })
}

describe('Reloj de los adaptadores de datos', () => {
  it('relojFijo devuelve siempre el mismo instante', () => {
    const reloj = relojFijo(INSTANTE)
    expect(reloj.now().toISOString()).toBe(INSTANTE)
    expect(reloj.now().toISOString()).toBe(INSTANTE)
  })

  it('relojDelSistema sigue el reloj real', () => {
    expect(relojDelSistema.now()).toBeInstanceOf(Date)
  })

  it('un instante inválido rompe fuerte y temprano, no genera fechas basura', () => {
    expect(() => relojFijo('ayer por la tarde')).toThrow(/instante inválido/)
  })

  it('los dispositivos, las aristas y las migraciones llevan el sello del reloj inyectado', () => {
    const { driver, dao } = baseConReloj(relojFijo(INSTANTE))
    sembrarDispositivo(dao)
    expect(driver.prepare('SELECT created_at, updated_at FROM device').get()).toEqual({
      created_at: INSTANTE,
      updated_at: INSTANTE,
    })
    expect(driver.prepare('SELECT created_at FROM relationship').get()?.created_at).toBe(INSTANTE)
    expect(driver.prepare('SELECT applied_at FROM schema_version ORDER BY version LIMIT 1').get()?.applied_at).toBe(INSTANTE)
    driver.close()
  })

  it('sin reloj inyectado las marcas de tiempo son las del sistema', () => {
    const { driver, dao } = baseConReloj()
    dao.upsertDevice({ slug: 'sw-2', name: 'Switch 2', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
    const sello = String(driver.prepare('SELECT updated_at FROM device').get()?.updated_at)
    expect(sello).not.toBe(INSTANTE)
    expect(new Date(sello).getFullYear()).toBeGreaterThan(2020)
    driver.close()
  })
})
