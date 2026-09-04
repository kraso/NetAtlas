import { NodeSqliteDriver, CatalogDao, loadMigrations, applyMigrations, ManifestRepository } from '@netatlas/data'
import { loadSeed } from './lint.js'
import { findPredicate, versionDelArchivo } from '@netatlas/domain'
import type { DatasetManifest, TopologyNodeProps, TopologyEdgeProps } from '@netatlas/domain'
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
      snmpEnterprise: (mfr as { snmpEnterprise?: number }).snmpEnterprise,
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

    for (const ficha of dev.datasheets ?? []) {
      dao.addDatasheet({
        deviceSlug: dev.slug,
        title: ficha.title,
        language: ficha.language,
        url: ficha.url,
        localPath: ficha.localPath,
        sourceSlug: ficha.sourceSlug,
      })
    }

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

  }

  // ── Aristas explícitas del seed (SEGUNDA PASADA): el objeto puede
  //    declararse DESPUÉS que su sujeto en devices.json; en una sola pasada
  //    esas referencias futuras se perdían en silencio (p.ej. 2930F→2920).
  for (const dev of seed.devices) {
    const deviceId = dao.deviceId(dev.slug)!
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

  // ── Estándares derivados de inventario/protocolos (F2-asistido) ───────────
  // implements-standard honesto-derivado (confidence=derived): cada puerto
  // Ethernet implica IEEE 802.3, PoE su 802.3x, y cada protocolo con estándar
  // canónico mapea a su RFC/IEEE. Trazable vía assertion + arista.
  const derived = seedDerivedStandards(dao, seed)
  assertionCount += derived.assertionCount
  relationshipCount += derived.relationshipCount

  // ── Topologías de referencia (F4 / §13.3) ────────────────────────────────────
  seedTopologies(dao, driver)

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
  const topologiasCount = count('topology')
  driver.close()
  // Cierra WAL dejando un archivo único portable (checkpoint + delete).
  rmSync(`${outPath}-wal`, { force: true })
  rmSync(`${outPath}-shm`, { force: true })

  // ── Manifiesto del dataset (NET-HW-048, §19.4) ──────────────────────────────
  const publishedOn = new Date().toISOString().slice(0, 10)
  const baseManifest: Omit<DatasetManifest, 'signature' | 'signatureValid'> = {
    format: 'netatlas-dataset',
    name: 'netatlas-seed',
    version: versionDelArchivo('netatlas-seed', publishedOn, 1),
    schemaVersion,
    publishedOn,
    counts: {
      dispositivos: seed.devices.length,
      relaciones: relationshipCount,
      assertions: assertionCount,
      protocolos: catalogCounts.protocols,
      categorias: catalogCounts.categories,
      topologias: topologiasCount,
    },
    sha256: ManifestRepository.hashArchivo(outPath),
    changelog: [`dataset:build regenerado (${publishedOn})`],
  }
  let manifest: DatasetManifest = baseManifest
  const clavePrivada = process.env.NETATLAS_SIGN_PRIVATE_KEY
  if (clavePrivada) {
    manifest = { ...baseManifest, signature: ManifestRepository.firmar(baseManifest, clavePrivada), signatureValid: true }
  }
  new ManifestRepository().escribir(`${outPath}.manifest.json`, manifest)
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
 * Topologías de referencia (NET-HW-033/034, §13.3): tres diagramas sembrados
 * sobre dispositivos reales del seed (navegables). `demostracion-300` ejerce
 * el SLO de diagramas (§23.2: ≤300 nodos layout+render <500 ms) en E2E.
 */
function seedTopologies(dao: CatalogDao, driver: NodeSqliteDriver): void {
  const primerosDe = (categoryCode: string, limit: number, offset = 0): string[] => {
    const rows = driver
      .prepare(
        `SELECT d.slug AS slug FROM device d
         JOIN category c ON c.id = d.category_id
         WHERE c.code = ? ORDER BY d.id LIMIT ? OFFSET ?`,
      )
      .all(categoryCode, limit, offset) as { slug: string }[]
    return rows.map((r) => String(r.slug))
  }

  const nodo = (type: 'device' | 'category', slug: string, x: number, y: number, layerHint?: number): TopologyNodeProps => ({
    entityType: type,
    entitySlug: slug,
    x,
    y,
    layerHint,
  })

  const crear = (def: { slug: string; name: string; kind: 'reference'; nodes: TopologyNodeProps[]; edges: TopologyEdgeProps[] }): void => {
    if (def.nodes.length === 0) return
    // Persistencia directa (síncrona) reutilizando la resolución de ids del DAO
    const topologyId = Number(
      driver.prepare('INSERT INTO topology (slug, name, kind, metadata) VALUES (?, ?, ?, \'{}\')').run(def.slug, def.name, def.kind).lastInsertRowid,
    )
    const nodeIdByOpenId = new Map<string, number>()
    for (const n of def.nodes) {
      const entityId = n.entityType === 'device' ? dao.deviceId(n.entitySlug) : dao.categoryId(n.entitySlug)
      if (entityId === undefined) continue
      const res = driver
        .prepare(
          'INSERT INTO topology_node (topology_id, entity_type, entity_id, x, y, layer_hint) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(topologyId, n.entityType, entityId, n.x ?? null, n.y ?? null, n.layerHint ?? null)
      nodeIdByOpenId.set(`${n.entityType}:${n.entitySlug}`, Number(res.lastInsertRowid))
    }
    for (const e of def.edges) {
      const from = nodeIdByOpenId.get(e.from)
      const to = nodeIdByOpenId.get(e.to)
      if (from === undefined || to === undefined) continue
      const mediumId = e.mediumCode !== undefined ? dao.mediumId(e.mediumCode, 'cobre') : null
      driver
        .prepare(
          'INSERT INTO topology_edge (topology_id, from_node, to_node, link_kind, medium_id, label) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(topologyId, from, to, e.linkKind ?? 'link', mediumId, e.label ?? null)
    }
  }

  // 1) Clos de 3 etapas (centro de datos): 2 spines + 4 leaves sobre CAT-DCN
  const spines = primerosDe('CAT-DCN', 2)
  const leaves = primerosDe('CAT-DCN', 4, 2)
  if (spines.length >= 2 && leaves.length >= 4) {
    const nodes: TopologyNodeProps[] = [
      nodo('category', 'CAT-DCN', 160, -80, 2),
      ...spines.map((s, i) => nodo('device', s, i * 180, 0, 2)),
      ...leaves.map((l, i) => nodo('device', l, i * 160, 180, 3)),
    ]
    const edges: TopologyEdgeProps[] = []
    for (const sp of spines) for (const lf of leaves) edges.push({ from: `device:${sp}`, to: `device:${lf}`, label: '40G uplink' })
    crear({ slug: 'clos-3-etapas', name: 'Centro de datos — Clos de 3 etapas', kind: 'reference', nodes, edges })
  }

  // 2) Sucursal típica: router → switch → AP
  const rtr = primerosDe('CAT-RTR-ENT', 1)[0]
  const sw = primerosDe('CAT-SWT-L2', 1)[0]
  const ap = primerosDe('CAT-WLS-AP', 1)[0]
  if (rtr && sw && ap) {
    crear({
      slug: 'sucursal-tipica',
      name: 'Sucursal típica (router + switch + AP)',
      kind: 'reference',
      nodes: [
        nodo('device', rtr, 0, 0, 3),
        nodo('device', sw, 220, 0, 2),
        nodo('device', ap, 440, 0, 1),
        nodo('category', 'CAT-WLS-AP', 440, 120, 1),
      ],
      edges: [
        { from: `device:${rtr}`, to: `device:${sw}`, label: '1G' },
        { from: `device:${sw}`, to: `device:${ap}`, label: 'PoE+' },
        { from: `device:${ap}`, to: 'category:CAT-WLS-AP', label: 'categoría' },
      ],
    })
  }

  // 3) Demostración de 300 nodos (SLO §23.2): primeros 300 dispositivos
  const todos = primerosDe('CAT-IFC', 300) as string[]
  if (todos.length > 0) {
    // Si la categoría no alcanza, completar con cualquier dispositivo
    if (todos.length < 300) {
      const extra = driver.prepare('SELECT slug FROM device ORDER BY id').all() as { slug: string }[]
      for (const e of extra) {
        if (todos.length >= 300) break
        if (!todos.includes(String(e.slug))) todos.push(String(e.slug))
      }
    }
    const nodes: TopologyNodeProps[] = todos.slice(0, 300).map((s, i) =>
      nodo('device', s, (i % 20) * 60, Math.floor(i / 20) * 60, 3),
    )
    const edges: TopologyEdgeProps[] = []
    for (let i = 1; i < nodes.length; i++) edges.push({ from: `device:${nodes[i - 1]!.entitySlug}`, to: `device:${nodes[i]!.entitySlug}`, linkKind: 'link' })
    // Algún entramado extra para que no sea una cadena pura
    for (let i = 20; i < nodes.length; i += 25) edges.push({ from: `device:${nodes[0]!.entitySlug}`, to: `device:${nodes[i]!.entitySlug}`, linkKind: 'link' })
    crear({ slug: 'demostracion-300', name: 'Demostración — 300 nodos (SLO de diagramas)', kind: 'reference', nodes, edges })
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

    // Hechos de inventario computados (puertos curados → EAV honesto-derivado):
    // todo dispositivo con puertos declara conteo total, uplinks y velocidad
    // máxima. Sin puertos no se inventa nada (empty-state honesto).
    const puertos = dev.ports ?? []
    if (puertos.length > 0) {
      const total = puertos.reduce((s, p) => s + (p.quantity ?? 0), 0)
      const uplinks = puertos
        .filter((p) => p.role === 'uplink')
        .reduce((s, p) => s + (p.quantity ?? 0), 0)
      const maxSpeed = Math.max(0, ...puertos.flatMap((p) => p.speedsMbps ?? []))
      const inv = (key: string, labelEs: string, value: number, unit?: string): void => {
        dao.defineAttribute({
          categoryCode: dev.categoryCode,
          key,
          labelEs,
          valueType: 'number',
          unit,
          isFacet: true,
          isComparable: false,
          compareRule: 'none',
        })
        dao.setDeviceAttribute(dev.slug, key, value)
      }
      inv('port_count', 'Puertos (inventario)', total)
      inv('uplink_ports', 'Puertos uplink', uplinks)
      if (maxSpeed > 0) inv('max_port_speed_mbps', 'Velocidad máxima de puerto', maxSpeed, 'Mbps')
    }
  }
}

/**
 * Estándares derivados (F2-asistido, confidence=derived): mapea protocolos con
 * estándar canónico e interfaces/PoE a su implements-standard. Solo mapeos
 * exactos (RFC/IEEE/ITU publicados); lo dudoso se omite, no se inventa.
 */
function seedDerivedStandards(
  dao: CatalogDao,
  seed: ReturnType<typeof loadSeed>,
): { assertionCount: number; relationshipCount: number } {
  const PROTOCOL_STANDARD: Record<string, string> = {
    ospf: 'ietf/2328', bgp: 'ietf/4271', rip: 'ietf/2453', vrrp: 'ietf/5798',
    dhcp: 'ietf/2131', dns: 'ietf/1035', snmp: 'ietf/3411', ntp: 'ietf/5905',
    ssh: 'ietf/4253', radius: 'ietf/2865', netconf: 'ietf/6241', restconf: 'ietf/8040',
    quic: 'ietf/9000', sctp: 'ietf/4960', bfd: 'ietf/5880',
    ipsec: 'ietf/4301', vxlan: 'ietf/7348', 'vxlan-evpn': 'ietf/7348', geneve: 'ietf/8926',
    profinet: 'pi/profinet', 'ethernet-ip': 'odva/ethernet-ip',
    ethernet: 'ieee/802.3', gpon: 'itu-t/G.984', xgspon: 'itu-t/G.9807.1',
    tsn: 'ieee/802.1Qbv', stp: 'ieee/802.1D', rstp: 'ieee/802.1w', mstp: 'ieee/802.1s',
    lldp: 'ieee/802.1ab', lacp: 'ieee/802.1ax', '802.1x': 'ieee/802.1X', '802.1q': 'ieee/802.1Q',
    ipv6: 'ietf/8200', tcp: 'ietf/793', udp: 'ietf/768', icmp: 'ietf/792', arp: 'ietf/826',
    prp: 'iec/62439-3', hsr: 'iec/62439-3', 'iec-61850': 'iec/61850',
    erps: 'itu-t/G.8032', otn: 'itu-t/G.709',
    '802.11a': 'ieee/802.11', '802.11b': 'ieee/802.11', '802.11g': 'ieee/802.11',
    '802.11n': 'ieee/802.11', '802.11ac': 'ieee/802.11', '802.11ax': 'ieee/802.11',
    '802.11be': 'ieee/802.11', wpa2: 'ieee/802.11i', wpa3: 'ieee/802.11i',
  }
  const ETHERNET_IFACES = new Set(['rj45', '2.5gbase-t', 'sfp', 'sfp-plus', 'sfp56', 'qsfp-plus', 'qsfp28', 'qsfp56'])
  let assertionCount = 0
  let relationshipCount = 0
  for (const dev of seed.devices) {
    const refs = new Set<string>()
    for (const assertion of dev.assertions ?? []) {
      if (assertion.predicate === 'supports-protocol' && typeof assertion.value === 'string') {
        const ref = PROTOCOL_STANDARD[assertion.value]
        if (ref) refs.add(ref)
      }
    }
    for (const port of dev.ports ?? []) {
      if (ETHERNET_IFACES.has(port.interfaceCode)) refs.add('ieee/802.3')
      if (port.poeStandard === '802.3af' || port.poeStandard === '802.3at' || port.poeStandard === '802.3bt') {
        refs.add(`ieee/${port.poeStandard}`)
      }
      if (port.interfaceCode === 'gpon') refs.add('itu-t/G.984')
    }
    if (refs.size === 0) continue
    const deviceId = dao.deviceId(dev.slug)!
    // Omite estándares ya curados explícitamente en el seed (evita duplicar
    // la arista y violar la unicidad de relationship).
    const curados = new Set(dao.existingStandardRefs(deviceId))
    for (const ref of [...refs].sort()) {
      if (curados.has(ref)) continue
      const assertionId = dao.addAssertion({
        subjectType: 'device',
        subjectId: deviceId,
        predicate: 'implements-standard',
        valueJson: JSON.stringify(ref),
        sourceSlug: 'netatlas-assist',
        confidence: 'derived',
        verifiedOn: '2025-02-10',
        author: 'curator-seed',
        reviewedBy: 'reviewer-seed',
      })
      assertionCount++
      dao.addRelationship({
        subjectType: 'device',
        subjectId: deviceId,
        predicate: 'implements-standard',
        objectType: 'standard',
        objectId: dao.standardId(ref),
        assertionId,
      })
      relationshipCount++
    }
  }
  return { assertionCount, relationshipCount }
}