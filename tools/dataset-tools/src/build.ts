import { NodeSqliteDriver, CatalogDao, loadMigrations, applyMigrations } from '@netatlas/data'
import { loadSeed } from './lint.js'
import { findPredicate } from '@netatlas/domain'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rmSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

/**
 * dataset:build — construye el SQLite del dataset seed a partir de las fuentes JSON.
 * El resultado es el artefacto `netatlas-seed.sqlite` (esquema + catálogos master +
 * 20 fichas piloto + assertions + aristas), base del MVP (F1).
 */
export function buildSeedDatabase(seedDir: string, outPath: string): {
  deviceCount: number
  relationshipCount: number
  assertionCount: number
  catalogCounts: { protocols: number; standards: number; media: number; manufacturers: number; categories: number }
  schemaVersion: number
} {
  const seed = loadSeed(seedDir)
  // Rebuild limpio: elimina una BD previa (el artefacto es inmutable por release).
  rmSync(outPath, { force: true })
  rmSync(`${outPath}-wal`, { force: true })
  rmSync(`${outPath}-shm`, { force: true })
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

  // ── Catálogos cerrados: protocolos, estándares, medios (NET-HW-006) ──
  for (const proto of seed.protocols) {
    dao.protocolId(proto.code, proto.name, proto.family, proto.osiLayer)
  }
  for (const std of seed.standards) {
    dao.standardId(`${std.org}/${std.identifier}`, std.title)
  }
  for (const med of seed.media) {
    dao.mediumId(med.code, med.kind as 'cobre' | 'fibra' | 'inalambrico' | 'coaxial', med.name)
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

  // ── EAV (§9.4): definiciones y valores derivados de assertions curadas ─────
  // Las facetas numéricas salen de las claves de assertion existentes en cada
  // categoría; 'stackable' se deriva de puertos de rol stack/resumen del seed.
  seedAttributes(dao, seed)

  const schemaRow = driver.prepare('SELECT MAX(version) AS v FROM schema_version').get()
  const schemaVersion = Number(schemaRow?.v ?? 0)
  const count = (t: string): number => Number(driver.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get()?.c ?? 0)
  const catalogCounts = {
    protocols: count('protocol'),
    standards: count('standard'),
    media: count('medium'),
    manufacturers: count('manufacturer'),
    categories: count('category'),
  }
  driver.close()
  // Cierra WAL dejando un archivo único portable (checkpoint + delete).
  rmSync(`${outPath}-wal`, { force: true })
  rmSync(`${outPath}-shm`, { force: true })

  return { deviceCount: seed.devices.length, relationshipCount, assertionCount, catalogCounts, schemaVersion }
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

/**
 * EAV (§9.4): puebla attribute_definition + device_attribute a partir de datos
 * ya curados del seed. Cada assertion numérica de un dispositivo se copia como
 * valor de atributo de su categoría (faceta numérica). 'stackable' (enum) solo
 * en familias de switching, derivado del inventario curado (rol stack o resumen).
 */
function seedAttributes(
  dao: CatalogDao,
  seed: ReturnType<typeof loadSeed>,
): void {
  // Metadatos por clave de assertion numérica: label, unidad, regla de comparación.
  const META: Record<string, { label: string; unit?: string; rule: 'higher-better' | 'lower-better' }> = {
    throughput_gbps: { label: 'Capacidad de conmutación', unit: 'Gbps', rule: 'higher-better' },
    switching_capacity_gbps: { label: 'Capacidad de conmutación', unit: 'Gbps', rule: 'higher-better' },
    poe_budget_w: { label: 'Presupuesto PoE', unit: 'W', rule: 'higher-better' },
    routing_throughput_mbps: { label: 'Rendimiento de ruteo', unit: 'Mbps', rule: 'higher-better' },
    firewall_throughput_gbps: { label: 'Rendimiento de firewall', unit: 'Gbps', rule: 'higher-better' },
    vpn_throughput_gbps: { label: 'Rendimiento VPN', unit: 'Gbps', rule: 'higher-better' },
    wifi_max_rate_mbps: { label: 'Tasa máxima inalámbrica', unit: 'Mbps', rule: 'higher-better' },
    power_consumption_w: { label: 'Consumo', unit: 'W', rule: 'lower-better' },
    mac_table_entries: { label: 'Entradas de tabla MAC', rule: 'higher-better' },
    sessions_per_sec: { label: 'Sesiones por segundo', rule: 'higher-better' },
  }

  for (const dev of seed.devices) {
    for (const assertion of dev.assertions ?? []) {
      const meta = META[assertion.predicate]
      if (!meta || typeof assertion.value !== 'number') continue
      dao.defineAttribute({
        categoryCode: dev.categoryCode,
        key: assertion.predicate,
        labelEs: meta.label,
        valueType: 'number',
        unit: meta.unit,
        isFacet: true,
        isComparable: true,
        compareRule: meta.rule,
      })
      dao.setDeviceAttribute(dev.slug, assertion.predicate, assertion.value)
    }

    // Faceta enum 'stackable' en familias de switching (CAT-SWT-*).
    if (dev.categoryCode.startsWith('CAT-SWT')) {
      const apilable =
        (dev.ports ?? []).some((p) => p.role === 'stack') ||
        /apilab|stackable|\bstack\b/i.test(dev.summary ?? '')
      dao.defineAttribute({
        categoryCode: dev.categoryCode,
        key: 'stackable',
        labelEs: 'Apilable',
        valueType: 'enum',
        enumValues: ['sí', 'no'],
        isFacet: true,
        isComparable: true,
        compareRule: 'set-compare',
      })
      dao.setDeviceAttribute(dev.slug, 'stackable', apilable ? 'sí' : 'no')
    }
  }
}