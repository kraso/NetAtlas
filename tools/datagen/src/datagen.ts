import { CatalogDao, NodeSqliteDriver, loadMigrations, applyMigrations } from '@netatlas/data'
import type { DeviceRow } from '@netatlas/data'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** Distribución plausible de categorías para el dataset sintético (sección 24.2). */
export interface DatagenConfig {
  readonly deviceCount: number
  readonly seed?: number | undefined
}

const CATEGORIES = [
  { code: 'CAT-IFC', nameEs: 'Interfaces de red', aliases: ['nic'] },
  { code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['switch'] },
  { code: 'CAT-RTR', nameEs: 'Routing', aliases: ['router'] },
  { code: 'CAT-WLS', nameEs: 'Inalámbricos', aliases: ['wifi', 'ap'] },
  { code: 'CAT-ACC', nameEs: 'Módems y acceso', aliases: ['modem', 'ont'] },
  { code: 'CAT-SEC', nameEs: 'Seguridad', aliases: ['firewall'] },
  { code: 'CAT-OPT', nameEs: 'Fibra y óptica', aliases: ['transceiver', 'sfp'] },
  { code: 'CAT-DCN', nameEs: 'Centros de datos', aliases: ['datacenter', 'tor'] },
] as const

const MANUFACTURERS = [
  { slug: 'cisco', name: 'Cisco Systems' },
  { slug: 'aruba', name: 'Aruba Networks' },
  { slug: 'juniper', name: 'Juniper Networks' },
  { slug: 'hpe', name: 'Hewlett Packard Enterprise' },
  { slug: 'ubiquiti', name: 'Ubiquiti Networks' },
  { slug: 'tplink', name: 'TP-Link' },
  { slug: 'netgear', name: 'Netgear' },
  { slug: 'mikrotik', name: 'MikroTik' },
  { slug: 'huawei', name: 'Huawei' },
  { slug: 'dell', name: 'Dell Technologies' },
  { slug: 'arista', name: 'Arista Networks' },
  { slug: 'fortinet', name: 'Fortinet' },
] as const

const LIFECYCLE = ['announced', 'current', 'mature', 'eol', 'eos', 'legacy', 'discontinued'] as const

const MODELS = ['2900', '2930F', '2960', '3850', '9200', '9300', 'Catalyst 1000', 'EX2300', 'EX3400',
  'QFX5120', 'Aruba 6100', 'Aruba 6300', 'EdgeRouter 4', 'MikroTik CRS328', 'UniFi Switch 48',
  'GS728TP', 'SG350X', 'S5720', 'PowerSwitch N3048', 'DCS-7050', 'FortiSwitch 424E', 'FortiGate 200F']

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateDevices(config: DatagenConfig): readonly DeviceRow[] {
  const rand = mulberry32(config.seed ?? 42)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!
  const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1))
  const pickSpeed = (): number[] => {
    const speeds = [100, 1000, 2500, 5000, 10000, 25000, 40000, 100000]
    const n = 1 + int(0, 2)
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(pick(speeds))
    return [...new Set(out)].sort((a, b) => a - b)
  }

  const rows: DeviceRow[] = []
  const used = new Set<string>()
  for (let i = 0; i < config.deviceCount; i++) {
    const mfr = pick(MANUFACTURERS)
    const cat = pick(CATEGORIES)
    const model = pick(MODELS)
    let slug: string
    do {
      slug = `${mfr.slug}-${model.toLowerCase().replace(/\s+/g, '-')}-${int(100, 999)}`
    } while (used.has(slug))
    used.add(slug)

    const portCount = cat.code === 'CAT-SWT' || cat.code === 'CAT-DCN' ? int(8, 96) : int(1, 8)
    rows.push({
      slug,
      name: `${mfr.name} ${model} ${portCount} port`,
      manufacturerSlug: mfr.slug,
      categoryCode: cat.code,
      lifecycleStatus: pick(LIFECYCLE),
      summary: `Dispositivo sintético de ${cat.nameEs} — ${portCount} puertos, velocidad ${pickSpeed().join('/')} Mbps`,
      osiProfileJson: JSON.stringify({
        terminate: cat.code === 'CAT-RTR' ? [1, 2, 3] : [1, 2],
        transparent: [3, 4, 5, 6, 7],
        primary: cat.code === 'CAT-RTR' ? 3 : 2,
      }),
    })
  }
  return rows
}

/** Directorio de migraciones del paquete @netatlas/data (resuelto en runtime). */
export function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', '..', 'packages', 'data', 'migrations')
}

/** Construye una BD migrada y poblada con N dispositivos sintéticos (in-memory para benchmark). */
export function buildSyntheticDataset(count: number, seed?: number): {
  driver: NodeSqliteDriver
  dao: CatalogDao
  rows: readonly DeviceRow[]
} {
  const driver = new NodeSqliteDriver(':memory:')
  applyMigrations(driver, loadMigrations(migrationsDir()))

  const dao = new CatalogDao(driver)
  for (const c of CATEGORIES) {
    dao.upsertCategory({ code: c.code, nameEs: c.nameEs, aliases: c.aliases })
  }
  for (const m of MANUFACTURERS) {
    dao.upsertManufacturer({ slug: m.slug, name: m.name })
  }

  const rows = generateDevices({ deviceCount: count, seed })
  dao.bulkInsertDevices(rows)
  for (const dev of rows) {
    dao.addPort({
      deviceSlug: dev.slug,
      interfaceCode: dev.categoryCode === 'CAT-OPT' ? 'sfp' : 'rj45',
      label: 'Puerto sintético',
      quantity: 4,
      speedsMbps: [100, 1000, 10000],
      role: 'access',
    })
  }
  return { driver, dao, rows }
}

export { CATEGORIES, MANUFACTURERS }