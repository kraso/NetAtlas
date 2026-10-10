import { readFileSync, writeFileSync } from 'node:fs'
import { loadSeed, type SeedDevice } from './lint.js'
import { DEVICES_MANUALES, OUT_FILE, SEED_DIR } from './assisted-rutas.js'
import { OSI_BY_FAMILY, OSI_POR_DEFECTO, PORTS_BY_FAMILY, PROTOCOLS_BY_FAMILY } from './assisted-familias.js'

/**
 * Generador asistido de fichas (Fase A, NET-HW-007 hacia 300–500).
 *
 * Regla de integridad (PLAN MAESTRO §4.3 / §20):
 *   - SOLO datos estructurales: categoría, fabricante, inventario de puertos
 *     típico POR CATEGORÍA, protocolos de familia y perfil OSI heredable
 *     (los catálogos viven en `assisted-familias.ts`).
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

type Seed = ReturnType<typeof loadSeed>

export { OUT_FILE, SEED_DIR } from './assisted-rutas.js'

const LIFECYCLES = ['current', 'mature'] as const

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
  return categoryCode.split('-').slice(0, 2).join('-')
}

/** Genera fichas asistidas a partir de los catálogos master (sin specs numéricas). */
export function generateAssisted(seed: Seed, count: number, seedValue = 42): SeedDevice[] {
  return generateAssistedInner(seed, new Set(seed.devices.map((d) => d.slug)), count, mulberry32(seedValue))
}

function generateAssistedInner(seed: Seed, usados: Set<string>, count: number, rand: () => number): SeedDevice[] {
  const out: SeedDevice[] = []
  const familias = familiasConCatalogo(seed)
  let intentos = 0
  while (out.length < count && intentos < count * 50) {
    intentos++
    const ficha = intentarFicha(seed, usados, familias, rand)
    if (ficha !== undefined) out.push(ficha)
  }
  return out
}

/** Familias con catálogo declarado (protocolos, puertos u OSI). */
function familiasConCatalogo(seed: Seed): string[] {
  return [...new Set(seed.categories.map((c) => c.code).map(familyOf))].filter((f) => f in PROTOCOLS_BY_FAMILY)
}

/** Una ficha candidata; devuelve undefined si el slug ya estaba usado. */
function intentarFicha(seed: Seed, usados: Set<string>, familias: readonly string[], rand: () => number): SeedDevice | undefined {
  const mfr = elegir(seed.manufacturers, rand)
  const familia = elegir(familias, rand)
  const subcategorias = seed.categories.filter((c) => familyOf(c.code) === familia)
  const categoria = elegir(subcategorias, rand)
  const n = Math.floor(rand() * 900) + 100
  const slug = `${mfr.slug}-${familia.toLowerCase()}-${n}`
  if (usados.has(slug)) return undefined
  usados.add(slug)
  return fichaDeFamilia(familia, categoria, mfr.slug, mfr.name, n, slug, elegir(LIFECYCLES, rand))
}

/** Ficha estructural completa: puertos de familia + assertions con fuente asistida. */
function fichaDeFamilia(
  familia: string,
  categoria: Seed['categories'][number],
  manufacturerSlug: string,
  manufacturerName: string,
  n: number,
  slug: string,
  lifecycleStatus: string,
): SeedDevice {
  return {
    slug,
    name: `${manufacturerName} ${familia.replace(/^CAT-/, '').replace(/-/g, ' ')} ${n}`,
    manufacturerSlug,
    categoryCode: categoria.code,
    lifecycleStatus,
    summary: resumenEstructural(categoria.nameEs),
    osiProfile: OSI_BY_FAMILY[familia] ?? OSI_POR_DEFECTO,
    ports: puertosDeFamilia(familia),
    assertions: assertionesDeFamilia(familia),
  }
}

/** Puertos típicos de la familia (nunca rendimiento declarado). */
function puertosDeFamilia(familia: string): SeedDevice['ports'] {
  return (PORTS_BY_FAMILY[familia] ?? []).map((p) => ({
    label: `${p.qty}x ${p.iface}`,
    interfaceCode: p.iface,
    quantity: p.qty,
    speedsMbps: p.speeds,
    role: p.role,
  }))
}

/** Assertions de familia con fuente asistida y nota de validación en F2. */
function assertionesDeFamilia(familia: string): SeedDevice['assertions'] {
  return (PROTOCOLS_BY_FAMILY[familia] ?? []).map((proto) => ({
    predicate: 'supports-protocol',
    value: proto,
    sourceSlug: 'netatlas-assist',
    confidence: 'third-party',
    note: 'datos asistidos de familia; validar en F2',
  }))
}

/** Resumen con el prefijo discriminador de la UI (insignia «ficha estructural»). */
function resumenEstructural(nameEs: string): string {
  return `Ficha de referencia estructural (importación asistida): ${nameEs}. Especificaciones numéricas pendientes de datasheet (F2).`
}

function elegir<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)]!
}

/** Escribe `devices-generated.json` (fichas asistidas, separadas de las curadas manualmente). */
export function writeAssistedDataset(target: number, seedValue = 42): { generated: number; total: number } {
  try {
    return generarYEscribir(target, seedValue)
  } catch (error) {
    // CLI de dataset: fallo explícito con contexto antes de propagar al llamador.
    console.error('[ERROR] no se pudo regenerar el dataset asistido', { error })
    throw error
  }
}

function generarYEscribir(target: number, seedValue: number): { generated: number; total: number } {
  const seed = loadSeed(SEED_DIR)
  // La base son SOLO las fichas curadas manualmente (devices.json), nunca las
  // asistidas que ya existan: regenerar siempre parte del mismo origen.
  const manualRaw = JSON.parse(readFileSync(DEVICES_MANUALES, 'utf8')) as SeedDevice[]
  const usados = new Set(manualRaw.map((d) => d.slug))
  const count = Math.max(0, target - manualRaw.length)
  const generated = generateAssistedInner(seed, usados, count, mulberry32(seedValue))
  writeFileSync(OUT_FILE, JSON.stringify(generated, null, 2), 'utf8')
  return { generated: generated.length, total: manualRaw.length + generated.length }
}

// CLI: pnpm gen-assist [target] [seedValue]
if (process.argv[1]?.includes('assisted-gen')) {
  const target = Number(process.argv[2] ?? 320)
  const { generated, total } = writeAssistedDataset(target)
  console.log(`fichas generadas: ${generated} → total del seed: ${total}`)
  console.log(`salida: ${OUT_FILE}`)
}
