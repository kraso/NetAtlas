import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSeed } from './lint.js'
import type { SeedDevice } from './lint.js'

/**
 * Generador asistido de fichas (Fase A, NET-HW-007 hacia 300–500).
 *
 * Regla de integridad (PLAN MAESTRO §4.3 / §20):
 *   - SOLO datos estructurales: categoría, fabricante, inventario de puertos
 *     típico POR CATEGORÍA, protocolos de familia y perfil OSI heredable.
 *   - NUNCA se inventan especificaciones numéricas (throughput, mpps, poe budget…):
 *     se omiten; quedan pendientes de datasheet en F2.
 *   - Toda assertion lleva confidence 'third-party' + fuente 'netatlas-assist'
 *     + nota 'datos asistidos; validar en F2' → la UI la muestra con insignia ámbar.
 *
 * Determinista (semilla) para reproducibilidad en CI.
 *
 * CONTRATO UI (opción 3): todo resumen generado empieza por
 * 'Ficha de referencia estructural'. apps/app/src/ui/device-sheet.tsx lo usa
 * como discriminador para la insignia «ficha estructural» — no cambiar el
 * prefijo sin actualizar la UI (hay test en sqlite-integration.test.tsx).
 */

const here = dirname(fileURLToPath(import.meta.url))
export const SEED_DIR = resolve(here, '..', '..', '..', 'datasets', 'seed')
export const OUT_FILE = join(SEED_DIR, 'devices-generated.json')

/** Protocolos típicos POR FAMILIA (códigos del catálogo cerrado). */
const PROTOCOLS_BY_FAMILY: Record<string, string[]> = {
  'CAT-SWT': ['802.1q', 'stp', 'rstp', 'lldp', 'lacp'],
  'CAT-SWT-L2': ['802.1q', 'rstp', 'lldp', 'lacp'],
  'CAT-SWT-L3': ['802.1q', 'rstp', 'lldp', 'lacp', 'ospf', 'bgp', 'vxlan'],
  'CAT-RTR': ['ospf', 'bgp', 'ipv6', 'nat', 'dhcp'],
  'CAT-RTR-ENT': ['ospf', 'bgp', 'ipv6', 'mpls', 'nat'],
  'CAT-WLS': ['802.11ax', 'wpa3', 'capwap'],
  'CAT-WLS-AP': ['802.11ax', 'wpa3'],
  'CAT-ACC': ['dhcp', 'nat', 'pppoe'],
  'CAT-ACC-CABLE': ['dhcp', 'docsis'],
  'CAT-ACC-ONT': ['gpon', 'ipv6', 'dhcp'],
  'CAT-SEC': ['ipsec', 'ssl-vpn', 'snmp'],
  'CAT-SEC-FW': ['ipsec', 'ssl-vpn'],
  'CAT-SEC-NGFW': ['ipsec', 'ssl-vpn', 'snmp'],
  'CAT-DCN': ['vxlan', 'bgp', 'roce', 'ospf'],
  'CAT-IND': ['profinet', 'modbus', 'ethernet-ip', 'tsn'],
  'CAT-IOT': ['mqtt', 'coap', 'ipv6'],
  'CAT-OPT': ['otn', 'dwdm', 'sonet-sdh'],
  'CAT-TEL': ['mpls', 'dwdm', 'sonet-sdh'],
}

/** Inventario típico POR CATEGORÍA (nunca especificación numérica de rendimiento). */
const PORTS_BY_FAMILY: Record<string, { iface: string; qty: number; speeds: number[]; role?: string }[]> = {
  'CAT-SWT': [
    { iface: 'rj45', qty: 48, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-SWT-L2': [
    { iface: 'rj45', qty: 24, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 2, speeds: [1000], role: 'uplink' },
  ],
  'CAT-SWT-L3': [
    { iface: 'rj45', qty: 24, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-RTR': [
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 2, speeds: [1000], role: 'uplink' },
  ],
  'CAT-RTR-ENT': [
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-WLS-AP': [{ iface: 'rj45', qty: 1, speeds: [1000], role: 'uplink' }],
  'CAT-WLS': [{ iface: 'rj45', qty: 2, speeds: [1000], role: 'access' }],
  'CAT-ACC-ONT': [
    { iface: 'gpon', qty: 1, speeds: [1000], role: 'uplink' },
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
  ],
  'CAT-ACC-CABLE': [{ iface: 'rj45', qty: 1, speeds: [1000], role: 'access' }],
  'CAT-SEC-NGFW': [
    { iface: 'rj45', qty: 8, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-SEC-FW': [
    { iface: 'rj45', qty: 8, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 4, speeds: [1000], role: 'uplink' },
  ],
  'CAT-DCN': [
    { iface: 'sfp-plus', qty: 48, speeds: [10000], role: 'access' },
    { iface: 'qsfp-plus', qty: 4, speeds: [40000], role: 'uplink' },
  ],
  'CAT-IND': [
    { iface: 'rj45', qty: 8, speeds: [100], role: 'access' },
    { iface: 'fibra', qty: 2, speeds: [100], role: 'uplink' },
  ],
  'CAT-IOT': [{ iface: 'rj45', qty: 1, speeds: [100], role: 'access' }],
  'CAT-OPT': [{ iface: 'sfp-plus', qty: 2, speeds: [10000], role: 'uplink' }],
  'CAT-TEL': [
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 2, speeds: [1000], role: 'uplink' },
  ],
}

/** Perfil OSI heredable por macrocategoría. */
const OSI_BY_FAMILY: Record<string, { terminate: number[]; transparent: number[]; primary: number }> = {
  'CAT-SWT': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-SWT-L2': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-SWT-L3': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-RTR': { terminate: [1, 2, 3, 4], transparent: [5, 6, 7], primary: 3 },
  'CAT-RTR-ENT': { terminate: [1, 2, 3, 4], transparent: [5, 6, 7], primary: 3 },
  'CAT-WLS': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-WLS-AP': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-ACC': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-ACC-CABLE': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-ACC-ONT': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-SEC': { terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 },
  'CAT-SEC-FW': { terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 },
  'CAT-SEC-NGFW': { terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 },
  'CAT-DCN': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-IND': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-IOT': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-OPT': { terminate: [1], transparent: [2, 3, 4, 5, 6, 7], primary: 1 },
  'CAT-TEL': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
}

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

function familyOf(categoryCode: string): string {
  return categoryCode.split('-').slice(0, 2).join('-') as keyof typeof PROTOCOLS_BY_FAMILY
}

/** Genera fichas asistidas a partir de los catálogos master (sin specs numéricas). */
export function generateAssisted(
  seed: ReturnType<typeof loadSeed>,
  count: number,
  seedValue = 42,
): SeedDevice[] {
  const rand = mulberry32(seedValue)
  const usados = new Set(seed.devices.map((d) => d.slug))
  return generateAssistedInner(seed, usados, count, rand)
}

function generateAssistedInner(
  seed: ReturnType<typeof loadSeed>,
  usados: Set<string>,
  count: number,
  rand: () => number,
): SeedDevice[] {
  const out: SeedDevice[] = []
  const lifecycles = ['current', 'mature'] as const

  const familias = [...new Set(seed.categories.map((c) => c.code).map(familyOf))]
    .filter((f) => f in PROTOCOLS_BY_FAMILY)

  let intentos = 0
  while (out.length < count && intentos < count * 50) {
    intentos++
    const mfr = seed.manufacturers[Math.floor(rand() * seed.manufacturers.length)]!
    const familia = familias[Math.floor(rand() * familias.length)]!
    // Subcategorías concretas dentro de la familia (o la familia si no hay)
    const candidatas = seed.categories.filter((c) => familyOf(c.code) === familia)
    const categoria = candidatas[Math.floor(rand() * candidatas.length)]!
    const n = Math.floor(rand() * 900) + 100
    const slug = `${mfr.slug}-${familia.toLowerCase().replace(/-/g, '-')}-${n}`
    if (usados.has(slug)) continue
    usados.add(slug)

    const protocols = PROTOCOLS_BY_FAMILY[familia] ?? []
    const ports = PORTS_BY_FAMILY[familia] ?? []
    const osi = OSI_BY_FAMILY[familia] ?? { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }

    out.push({
      slug,
      name: `${mfr.name} ${familia.replace(/^CAT-/, '').replace(/-/g, ' ')} ${n}`,
      manufacturerSlug: mfr.slug,
      categoryCode: categoria.code,
      lifecycleStatus: lifecycles[Math.floor(rand() * lifecycles.length)]!,
      summary: `Ficha de referencia estructural (importación asistida): ${categoria.nameEs}. Especificaciones numéricas pendientes de datasheet (F2).`,
      osiProfile: osi,
      ports: ports.map((p) => ({
        label: `${p.qty}x ${p.iface}`,
        interfaceCode: p.iface,
        quantity: p.qty,
        speedsMbps: p.speeds,
        role: p.role,
      })),
      assertions: protocols.map((proto) => ({
        predicate: 'supports-protocol',
        value: proto,
        sourceSlug: 'netatlas-assist',
        confidence: 'third-party',
        note: 'datos asistidos de familia; validar en F2',
      })),
    })
  }
  return out
}

/** Escribe `devices-generated.json` (fichas asistidas, separadas de las curadas manualmente). */
export function writeAssistedDataset(target: number, seedValue = 42): { generated: number; total: number } {
  const seed = loadSeed(SEED_DIR)
  // La base son SOLO las fichas curadas manualmente (devices.json), nunca las
  // asistidas que ya existan: regenerar siempre parte del mismo origen.
  const manualRaw = JSON.parse(readFileSync(join(SEED_DIR, 'devices.json'), 'utf8')) as SeedDevice[]
  const used = new Set(manualRaw.map((d) => d.slug))
  const need = Math.max(0, target - manualRaw.length)
  const generated = generateAssistedFrom(seed, used, need, seedValue)
  writeFileSync(OUT_FILE, JSON.stringify(generated, null, 2), 'utf8')
  return { generated: generated.length, total: manualRaw.length + generated.length }
}

/** Igual que generateAssisted pero acepta el conjunto de slugs ya usados. */
function generateAssistedFrom(
  seed: ReturnType<typeof loadSeed>,
  usadosIniciales: ReadonlySet<string>,
  count: number,
  seedValue: number,
): SeedDevice[] {
  const rand = mulberry32(seedValue)
  const usados = new Set(usadosIniciales)
  return generateAssistedInner(seed, usados, count, rand)
}

// CLI: pnpm gen-assist [target] [seedValue]
if (process.argv[1]?.includes('assisted-gen')) {
  const target = Number(process.argv[2] ?? 320)
  const { generated, total } = writeAssistedDataset(target)
  console.log(`fichas generadas: ${generated} → total del seed: ${total}`)
  console.log(`salida: ${OUT_FILE}`)
}