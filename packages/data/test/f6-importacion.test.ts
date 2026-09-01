import { describe, expect, it, beforeAll } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { writeFileSync } from 'node:fs'
import {
  NodeSqliteDriver,
  CatalogDao,
  SqliteReconciliationRepository,
  SqliteQualityRepository,
  ManifestRepository,
  applyDelta,
  diffDatasets,
  applyMigrations,
  loadMigrations,
} from '../src/index.js'
import type { DatasetManifest } from '@netatlas/domain'
import { fileURLToPath } from 'node:url'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

function baseDriver(): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(':memory:')
  applyMigrations(driver, loadMigrations(migrationsDir))
  return driver
}

function sembrar(driver: NodeSqliteDriver): void {
  const dao = new CatalogDao(driver)
  dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
  dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: [] })
  dao.upsertDevice({ slug: 'sw-1', name: 'Switch 1', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
  dao.upsertSource({ slug: 'src-a', kind: 'datasheet', title: 'A', authorityLevel: 1 })
  dao.addAssertion({ subjectType: 'device', subjectId: dao.deviceId('sw-1')!, predicate: 'throughput_gbps', valueJson: '{"gbps":100}', sourceSlug: 'src-a', confidence: 'official', verifiedOn: '2025-01-01', author: 'test' })
  dao.upsertDevice({ slug: 'sw-2', name: 'Switch 2', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
}

describe('Cola de reconciliación (NET-HW-045)', () => {
  let repo: SqliteReconciliationRepository

  beforeAll(() => {
    const driver = baseDriver()
    sembrar(driver)
    repo = new SqliteReconciliationRepository(driver)
  })

  it('crea, lista pendientes y resuelve con autor (flujo revisor)', async () => {
    await repo.crear({ entradaSlug: 'sw-1-nuevo', existenteSlug: 'sw-1', score: 0.82, diff: [{ campo: 'name', entrante: 'Switch 1 v2', existente: 'Switch 1' }] })
    expect(await repo.contarPendientes()).toBe(1)
    const pendientes = await repo.pendientes()
    expect(pendientes[0]?.entradaSlug).toBe('sw-1-nuevo')
    expect(pendientes[0]?.diff[0]?.campo).toBe('name')

    await repo.resolver(pendientes[0]!.id, 'accepted', 'revisora')
    expect(await repo.contarPendientes()).toBe(0)
    const resuelta = (await repo.pendientes()).find((r) => r.entradaSlug === 'sw-1-nuevo')
    expect(resuelta?.status).toBe('accepted')
    expect(resuelta?.author).toBe('revisora')
  })
})

describe('Dashboard de calidad (NET-HW-047)', () => {
  it('calcula cobertura de fuentes, confianza, EAV y pendientes', async () => {
    const driver = baseDriver()
    sembrar(driver)
    new CatalogDao(driver).defineAttribute({ categoryCode: 'CAT-SWT', key: 'switching_capacity_gbps', labelEs: 'Capacidad', valueType: 'number', isFacet: true, compareRule: 'higher-better' })
    new CatalogDao(driver).setDeviceAttribute('sw-1', 'switching_capacity_gbps', 100)

    const q = new SqliteQualityRepository(driver).qualityReport()
    expect(q.dispositivos).toBe(2)
    expect(q.conAssertions).toBe(1)
    expect(q.coberturaFuentes).toBe(50)
    expect(q.distribucionConfianza.find((c) => c.confianza === 'official')?.n).toBe(1)
    expect(q.atributosEAV).toBe(1)
    expect(q.dispositivosSinEAV).toBe(1) // sw-2
    expect(q.relaciones).toBe(0)
    expect(q.porCategoria.find((c) => c.categoria === 'CAT-SWT')?.cobertura).toBe(50)
  })
})

describe('Manifiesto y delta (NET-HW-048)', () => {
  it('canonicalJson + hash + firma/verificación Ed25519', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const privHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex')
    const pubHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex')

    const base: DatasetManifest = {
      format: 'netatlas-dataset',
      name: 'netatlas-seed',
      version: 'v1',
      schemaVersion: 1,
      publishedOn: '2025-01-01',
      counts: { dispositivos: 3 },
      sha256: 'deadbeef',
    }
    const firmado: DatasetManifest = { ...base, signature: ManifestRepository.firmar(base, privHex), signatureValid: true }
    expect(ManifestRepository.verificar(firmado, pubHex)).toBe(true)
    // Firma alterada → inválida
    expect(ManifestRepository.verificar({ ...firmado, sha256: 'otro' }, pubHex)).toBe(false)

    expect(ManifestRepository.compat({ ...base, schemaVersion: 0 }).status).toBe('obsoleto')
    expect(ManifestRepository.compat(base).status).toBe('compatible')
  })

  it('escribe y lee el manifiesto desde disco', () => {
    const repo = new ManifestRepository()
    const path = join(tmpdir(), `netatlas-manifest-${Date.now()}.json`)
    const m: DatasetManifest = { format: 'netatlas-dataset', name: 'x', version: 'v1', schemaVersion: 1, publishedOn: '2025-01-01', counts: {} }
    repo.escribir(path, m)
    expect(repo.leer(path)?.version).toBe('v1')
    writeFileSync(path, '', 'utf8')
  })

  it('diffDatasets + applyDelta reproducen el destino sin SQL manual', async () => {
    const desde = baseDriver()
    sembrar(desde) // sw-1 (con assertion), sw-2
    const hasta = baseDriver()
    sembrar(hasta)
    const daoA = new CatalogDao(hasta)
    daoA.upsertDevice({ slug: 'sw-nuevo', name: 'Switch nuevo', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })
    daoA.eliminarDeviceCompleto('sw-2')
    daoA.upsertDevice({ slug: 'sw-1', name: 'Switch 1 actualizado', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT', lifecycleStatus: 'current' })

    const cambios = diffDatasets(desde, hasta)
    const accion = (slug: string): string | undefined => cambios.find((c) => c.slug === slug)?.accion
    expect(accion('sw-nuevo')).toBe('alta')
    expect(accion('sw-2')).toBe('delete')
    expect(accion('sw-1')).toBe('update')

    const destino = baseDriver()
    sembrar(destino)
    const res = applyDelta(destino, cambios)
    expect(res.razones).toEqual([])
    expect(res.aplicados).toBe(3)
    const daoDest = new CatalogDao(destino)
    expect(daoDest.deviceId('sw-nuevo')).toBeDefined()
    expect(daoDest.deviceId('sw-2')).toBeUndefined()
    const nombre = destino.prepare("SELECT name FROM device WHERE slug = 'sw-1'").get() as { name: string }
    expect(nombre.name).toBe('Switch 1 actualizado')
  })
})