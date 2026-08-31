import { readFileSync } from 'node:fs'
import { LIFECYCLE_STATUSES, isConfidence, findPredicate } from '@netatlas/domain'

/**
 * data:lint — valida los invariantes del dataset seed (PLAN MAESTRO §7.5, §8.6, §19.5):
 * 1. Ninguna categoría huérfana (todas cuelgan del árbol).
 * 2. Ningún dispositivo sin categoría primaria existente.
 * 3. Fabricantes referenciados existen.
 * 4. Slugs únicos entre dispositivos.
 * 5. Estados de ciclo de vida canónicos.
 * 6. Fuentes referenciadas por assertions existen.
 * 7. Confianza de assertions canónica.
 * 8. Relaciones: predicado conocido y extremos referenciados.
 * 9. `replaced-by` ⇒ estado EoL+ en el sujeto.
 * 10. `evolves-into`/`succeeds` acíclicos.
 */

export interface LintIssue {
  readonly severity: 'error' | 'warning'
  readonly rule: string
  readonly message: string
}

export interface LintReport {
  readonly issues: readonly LintIssue[]
  readonly ok: boolean
}

export interface SeedDevice {
  slug: string
  name: string
  manufacturerSlug?: string
  familySlug?: string
  categoryCode: string
  lifecycleStatus: string
  summary?: string
  osiProfile?: { terminate: number[]; transparent: number[]; primary: number }
  ports?: { label: string; interfaceCode: string; quantity: number; speedsMbps: number[]; poeStandard?: string; role?: string }[]
  assertions?: { predicate: string; sourceSlug: string; confidence?: string; value?: unknown }[]
  relationships?: { predicate: string; objectType: string; objectSlug: string }[]
}

interface SeedCategory {
  code: string
  parentCode?: string
  nameEs: string
  aliases?: string[]
  sortOrder?: number
}

interface SeedManufacturer {
  slug: string
  name: string
  country?: string
  website?: string
  status?: string
}

interface SeedSource {
  slug: string
  kind: string
  title: string
  authorityLevel: number
}

/** Catálogos cerrados (sección 8.1): protocolos, estándares, medios. */
interface SeedProtocol {
  code: string
  name: string
  family: string
  osiLayer: number
  aliases?: string[]
  status?: string
}

interface SeedStandard {
  org: string
  identifier: string
  title: string
  status?: string
}

interface SeedMedium {
  code: string
  kind: string
  name: string
  maxDistanceM?: number
  maxSpeedMbps?: number
}

export function lintSeed(input: {
  categories: readonly SeedCategory[]
  manufacturers: readonly SeedManufacturer[]
  sources: readonly SeedSource[]
  protocols: readonly SeedProtocol[]
  standards: readonly SeedStandard[]
  media: readonly SeedMedium[]
  devices: readonly SeedDevice[]
}): LintReport {
  const issues: LintIssue[] = []
  const push = (severity: LintIssue['severity'], rule: string, message: string): void => {
    issues.push({ severity, rule, message })
  }

  const categoryCodes = new Set(input.categories.map((c) => c.code))
  const manufacturerSlugs = new Set(input.manufacturers.map((m) => m.slug))
  const sourceSlugs = new Set(input.sources.map((s) => s.slug))
  const protocolCodes = new Set(input.protocols.map((p) => p.code))
  const standardRefs = new Set(input.standards.map((s) => `${s.org}/${s.identifier}`.toLowerCase()))
  const mediumCodes = new Set(input.media.map((m) => m.code))
  const deviceSlugs = new Set<string>()

  // Catálogos cerrados: códigos únicos (con exclusión de conflictos)
  for (const p of input.protocols) {
    if (!p.code || p.code.trim() === '') push('error', 'protocol-code', 'Protocolo sin código.')
  }
  for (const m of input.media) {
    if (!m.code || m.code.trim() === '') push('error', 'medium-code', 'Medio sin código.')
  }
  for (const s of input.standards) {
    if (!s.org || !s.identifier) push('error', 'standard-code', `Estándar incompleto: ${s.title ?? '(sin título)'}.`)
  }

  // 1. Categorías huérfanas: todo parentCode debe existir
  for (const category of input.categories) {
    if (category.parentCode !== undefined && !categoryCodes.has(category.parentCode)) {
      push('error', 'category-orphan', `Categoría "${category.code}" referencia padre inexistente "${category.parentCode}".`)
    }
  }

  // 2/3/4/5. Dispositivos
  for (const device of input.devices) {
    if (deviceSlugs.has(device.slug)) {
      push('error', 'device-duplicate', `Slug de dispositivo duplicado: "${device.slug}".`)
    }
    deviceSlugs.add(device.slug)

    if (device.manufacturerSlug !== undefined && !manufacturerSlugs.has(device.manufacturerSlug)) {
      push('error', 'device-manufacturer', `Dispositivo "${device.slug}" referencia fabricante inexistente "${device.manufacturerSlug}".`)
    }
    if (!categoryCodes.has(device.categoryCode)) {
      push('error', 'device-category', `Dispositivo "${device.slug}" referencia categoría inexistente "${device.categoryCode}".`)
    }
    if (!LIFECYCLE_STATUSES.includes(device.lifecycleStatus as (typeof LIFECYCLE_STATUSES)[number])) {
      push('error', 'device-lifecycle', `Dispositivo "${device.slug}" tiene estado de ciclo de vida inválido "${device.lifecycleStatus}".`)
    }

    // 6/7. Assertions con fuentes y confianza
    for (const assertion of device.assertions ?? []) {
      if (!sourceSlugs.has(assertion.sourceSlug)) {
        push('error', 'assertion-source', `Dispositivo "${device.slug}": assertion "${assertion.predicate}" referencia fuente inexistente "${assertion.sourceSlug}".`)
      }
      if (assertion.confidence !== undefined && !isConfidence(assertion.confidence)) {
        push('error', 'assertion-confidence', `Dispositivo "${device.slug}": confianza inválida "${assertion.confidence}".`)
      }
      // 8.6-1: supports-protocol en assertion debe apuntar a catálogo cerrado
      if (assertion.predicate === 'supports-protocol' && typeof assertion.value === 'string') {
        const code = assertion.value.trim().toLowerCase()
        const exists = protocolCodes.has(code)
        if (!exists) {
          push('error', 'closed-catalog', `Dispositivo "${device.slug}": assertion supports-protocol apunta a protocolo inexistente "${assertion.value}".`)
        }
      }
    }

    // 8. Relaciones: predicado conocido y extremos referenciados
    for (const rel of device.relationships ?? []) {
      const spec = findPredicate(rel.predicate)
      if (!spec) {
        push('error', 'relationship-predicate', `Dispositivo "${device.slug}": predicado desconocido "${rel.predicate}".`)
      } else if (rel.objectType === 'device' && !input.devices.some((d) => d.slug === rel.objectSlug)) {
        push('error', 'relationship-object', `Dispositivo "${device.slug}": relación "${rel.predicate}" apunta a dispositivo inexistente "${rel.objectSlug}".`)
      }

      // 8.6-1: extremos de catálogo cerrado (protocolo/estándar/medio) deben existir
      if (rel.objectType === 'protocol' && !protocolCodes.has(rel.objectSlug)) {
        push('error', 'closed-catalog', `Dispositivo "${device.slug}": relación "${rel.predicate}" a protocolo inexistente "${rel.objectSlug}".`)
      }
      if (rel.objectType === 'medium' && !mediumCodes.has(rel.objectSlug)) {
        push('error', 'closed-catalog', `Dispositivo "${device.slug}": relación "${rel.predicate}" a medio inexistente "${rel.objectSlug}".`)
      }
      if (rel.objectType === 'standard' && !standardRefs.has(rel.objectSlug.toLowerCase())) {
        push('error', 'closed-catalog', `Dispositivo "${device.slug}": relación "${rel.predicate}" a estándar inexistente "${rel.objectSlug}".`)
      }

      // 9. replaced-by ⇒ EoL+
      if (rel.predicate === 'replaced-by') {
        const eolLike = ['eol', 'eos', 'discontinued']
        if (!eolLike.includes(device.lifecycleStatus)) {
          push('error', 'replaced-by-lifecycle', `Dispositivo "${device.slug}" tiene "replaced-by" pero su estado es "${device.lifecycleStatus}" (debe ser eol/eos/discontinued).`)
        }
      }
    }
  }

  // 10. Aciclicidad de genealogía (evolves-into, succeeds, replaced-by)
  const adjacency = new Map<string, string[]>()
  for (const device of input.devices) {
    for (const rel of device.relationships ?? []) {
      const spec = findPredicate(rel.predicate)
      if (spec?.acyclic && rel.objectType === 'device') {
        const from = device.slug
        const to = rel.objectSlug
        if (!adjacency.has(from)) adjacency.set(from, [])
        adjacency.get(from)!.push(to)
      }
    }
  }
  const findCycle = (): string[] | undefined => {
    const visiting = new Set<string>()
    const done = new Set<string>()
    const stack: string[] = []
    const dfs = (node: string): string[] | undefined => {
      if (done.has(node)) return undefined
      if (visiting.has(node)) {
        const idx = stack.indexOf(node)
        return [...stack.slice(idx), node]
      }
      visiting.add(node)
      stack.push(node)
      for (const next of adjacency.get(node) ?? []) {
        const cycle = dfs(next)
        if (cycle) return cycle
      }
      stack.pop()
      visiting.delete(node)
      done.add(node)
      return undefined
    }
    for (const node of adjacency.keys()) {
      const cycle = dfs(node)
      if (cycle) return cycle
    }
    return undefined
  }
  const cycle = findCycle()
  if (cycle) {
    push('error', 'genealogy-acyclic', `Ciclo de genealogía detectado: ${cycle.join(' → ')}.`)
  }

  return { issues, ok: issues.every((i) => i.severity === 'warning') }
}

export function loadSeed(dir: string): {
  categories: readonly SeedCategory[]
  manufacturers: readonly SeedManufacturer[]
  sources: readonly SeedSource[]
  protocols: readonly SeedProtocol[]
  standards: readonly SeedStandard[]
  media: readonly SeedMedium[]
  devices: readonly SeedDevice[]
} {
  const read = <T,>(file: string): T => {
    try {
      return JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as T
    } catch (err) {
      throw new Error(`No se pudo leer ${file}: ${(err as Error).message}`)
    }
  }
  // Fichas curadas manualmente + fichas asistidas (devices-generated.json), si existen.
  const manuales = read<SeedDevice[]>('devices.json')
  let asistidas: SeedDevice[] = []
  try {
    asistidas = read<SeedDevice[]>('devices-generated.json')
  } catch {
    asistidas = []
  }
  return {
    categories: read('categories.json'),
    manufacturers: read('manufacturers.json'),
    sources: read('sources.json'),
    protocols: read('protocols.json'),
    standards: read('standards.json'),
    media: read('media.json'),
    devices: [...manuales, ...asistidas],
  }
}