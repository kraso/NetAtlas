import { NodeSqliteDriver, CatalogDao, loadMigrations, applyMigrations } from '@netatlas/data'
import { loadSeed } from './lint.js'
import { findPredicate } from '@netatlas/domain'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

/**
 * dataset:build — construye el SQLite del dataset seed a partir de las fuentes JSON.
 * El resultado es el artefacto `netatlas-seed.sqlite` (prototipo de esquema + 20 fichas
 * piloto + assertions + aristas), base del MVP (F1).
 */
export function buildSeedDatabase(seedDir: string, outPath: string): {
  deviceCount: number
  relationshipCount: number
  assertionCount: number
  schemaVersion: number
} {
  const seed = loadSeed(seedDir)
  const driver = new NodeSqliteDriver(outPath)
  try {
    applyMigrations(driver, loadMigrations(MIGRATIONS_DIR))
  } catch (err) {
    driver.close()
    throw new Error(`dataset:build — fallo al aplicar migraciones: ${(err as Error).message}`)
  }

  const dao = new CatalogDao(driver)

  // ── Catálogos maestros ─────────────────────────────────────────────
  for (const cat of seed.categories) {
    dao.upsertCategory({
      code: cat.code,
      parentCode: cat.parentCode,
      nameEs: cat.nameEs,
      aliases: cat.aliases ?? [],
      sortOrder: cat.sortOrder ?? 0,
    })
  }
  for (const mfr of seed.manufacturers) {
    dao.upsertManufacturer({
      slug: mfr.slug,
      name: mfr.name,
      country: mfr.country,
      website: mfr.website,
    })
  }
  for (const src of seed.sources) {
    dao.upsertSource({
      slug: src.slug,
      kind: src.kind,
      publisher: (src as { publisher?: string }).publisher,
      title: src.title,
      url: (src as { url?: string }).url,
      retrievedOn: (src as { retrievedOn?: string }).retrievedOn,
      authorityLevel: src.authorityLevel,
    })
  }

  // ── Predicados canónicos ───────────────────────────────────────────
  const predicateRows = [
    { code: 'manufactured-by', domain: ['device'], range: ['manufacturer'], cardinality: 'one' },
    { code: 'belongs-to-family', domain: ['device'], range: ['product-family'] },
    { code: 'has-category', domain: ['device'], range: ['category'], cardinality: 'one' },
    { code: 'has-role-category', domain: ['device'], range: ['category'] },
    { code: 'supports-protocol', domain: ['device'], range: ['protocol'] },
    { code: 'implements-standard', domain: ['device', 'protocol', 'interface'], range: ['standard'] },
    { code: 'uses-technology', domain: ['device'], range: ['technology'] },
    { code: 'operates-at-layer', domain: ['device', 'category'], range: ['layer'] },
    { code: 'terminates-medium', domain: ['device', 'interface'], range: ['medium'] },
    { code: 'compatible-with', domain: ['device', 'interface'], range: ['device', 'interface'], symmetric: true },
    { code: 'succeeds', domain: ['device'], range: ['device'], acyclic: true, inverse: 'precedes' },
    { code: 'precedes', domain: ['device'], range: ['device'], acyclic: true, inverse: 'succeeds' },
    { code: 'replaced-by', domain: ['device'], range: ['device'], acyclic: true },
    { code: 'similar-to', domain: ['device'], range: ['device'], symmetric: true },
    { code: 'evolves-into', domain: ['technology', 'category'], range: ['technology', 'category'], acyclic: true },
    { code: 'uses-interface', domain: ['device'], range: ['interface'] },
  ]
  // El DAO tipa estructuralmente; pasamos tal cual.
  dao.seedPredicates(predicateRows as Parameters<CatalogDao['seedPredicates']>[0])

  // ── Capas OSI/TCP-IP semilla ────────────────────────────────────────
  const OSI: [number, string, string][] = [
    [1, 'Física', 'Physical'],
    [2, 'Enlace de datos', 'Data Link'],
    [3, 'Red', 'Network'],
    [4, 'Transporte', 'Transport'],
    [5, 'Sesión', 'Session'],
    [6, 'Presentación', 'Presentation'],
    [7, 'Aplicación', 'Application'],
  ]
  const TCPIP: [number, string, string][] = [
    [1, 'Acceso a red', 'Network Access'],
    [2, 'Internet', 'Internet'],
    [3, 'Transporte', 'Transport'],
    [4, 'Aplicación', 'Application'],
  ]
  for (const [n, es, en] of OSI) dao.seedLayer(n, es, en, 'osi_layer')
  for (const [n, es, en] of TCPIP) dao.seedLayer(n, es, en, 'tcpip_layer')

  // ── Dispositivos, puertos, assertions, aristas ─────────────────────
  let assertionCount = 0
  let relationshipCount = 0
  for (const dev of seed.devices) {
    dao.upsertDevice({
      slug: dev.slug,
      name: dev.name,
      manufacturerSlug: dev.manufacturerSlug ?? 'tplink',
      categoryCode: dev.categoryCode,
      lifecycleStatus: dev.lifecycleStatus,
      osiProfileJson: dev.osiProfile ? JSON.stringify(dev.osiProfile) : undefined,
      summary: dev.summary,
    })
    const deviceId = dao.deviceId(dev.slug)!

    for (const port of dev.ports ?? []) {
      dao.addPort({
        deviceSlug: dev.slug,
        interfaceCode: port.interfaceCode,
        label: port.label,
        quantity: port.quantity,
        speedsMbps: port.speedsMbps,
        poeStandard: port.poeStandard,
        role: port.role,
      })
    }

    for (const assertion of dev.assertions ?? []) {
      const assertionId = dao.addAssertion({
        subjectType: 'device',
        subjectId: deviceId,
        predicate: assertion.predicate,
        valueJson: JSON.stringify(assertion.value),
        sourceSlug: assertion.sourceSlug,
        confidence: assertion.confidence ?? 'derived',
        verifiedOn: '2025-02-10',
        author: 'curator-seed',
        reviewedBy: 'reviewer-seed',
      })
      assertionCount++
      if (assertion.predicate === 'supports-protocol' && typeof assertion.value === 'string') {
        dao.addRelationship({
          subjectType: 'device',
          subjectId: deviceId,
          predicate: 'supports-protocol',
          objectType: 'protocol',
          objectId: dao.protocolId(assertion.value),
          assertionId,
        })
        relationshipCount++
      }
    }

    for (const rel of dev.relationships ?? []) {
      const spec = findPredicate(rel.predicate)
      if (!spec) continue
      const objectId = resolveObjectId(dao, rel.objectType, rel.objectSlug)
      if (objectId === undefined) continue
      dao.addRelationship({
        subjectType: 'device',
        subjectId: deviceId,
        predicate: rel.predicate,
        objectType: rel.objectType,
        objectId,
      })
      relationshipCount++
    }
  }

  const schemaRow = driver.prepare('SELECT MAX(version) AS v FROM schema_version').get()
  const schemaVersion = Number(schemaRow?.v ?? 0)
  driver.close()

  return { deviceCount: seed.devices.length, relationshipCount, assertionCount, schemaVersion }
}

function resolveObjectId(dao: CatalogDao, type: string, slug: string): number | undefined {
  switch (type) {
    case 'layer':
      return dao.seedLayerId(slug)
    case 'standard':
      return dao.standardId(slug)
    case 'device':
      return dao.deviceId(slug)
    case 'medium':
      return dao.mediumId(slug, slug.startsWith('smf') || slug.startsWith('mmf') ? 'fibra' : 'inalambrico')
    default:
      return undefined
  }
}