/**
 * Tipos compartidos de data:lint (dataset seed).
 *
 * Los módulos de reglas (`lint-catalogos`, `lint-dispositivos`, `lint-grafo`),
 * la lectura del seed (`lint-seed`) y el orquestador (`lint.ts`) comparten
 * estas formas para no repetirlas ni acoplarse entre sí.
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

/** Acumulador de avisos que recibe cada módulo de reglas. */
export type Push = (severity: LintIssue['severity'], rule: string, message: string) => void

export interface SeedPort {
  label: string
  interfaceCode: string
  quantity: number
  speedsMbps: number[]
  poeStandard?: string
  role?: string
}

export interface SeedAssertion {
  predicate: string
  sourceSlug: string
  confidence?: string
  value?: unknown
}

export interface SeedRelationship {
  predicate: string
  objectType: string
  objectSlug: string
}

export interface SeedDatasheet {
  title: string
  language?: string
  url?: string
  localPath?: string
  sourceSlug: string
}

export interface SeedImage {
  kind: string
  caption?: string
  localPath?: string
  url?: string
  sourceSlug: string
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
  ports?: SeedPort[]
  assertions?: SeedAssertion[]
  relationships?: SeedRelationship[]
  datasheets?: SeedDatasheet[]
  images?: SeedImage[]
}

export interface SeedCategory {
  code: string
  parentCode?: string
  nameEs: string
  aliases?: string[]
  sortOrder?: number
}

export interface SeedManufacturer {
  slug: string
  name: string
  snmpEnterprise?: number
  country?: string
  website?: string
  status?: string
}

export interface SeedSource {
  slug: string
  kind: string
  title: string
  authorityLevel: number
}

/** Catálogos cerrados (sección 8.1): protocolos, estándares, medios. */
export interface SeedProtocol {
  code: string
  name: string
  family: string
  osiLayer: number
  aliases?: string[]
  status?: string
}

export interface SeedStandard {
  org: string
  identifier: string
  title: string
  status?: string
}

export interface SeedMedium {
  code: string
  kind: string
  name: string
  maxDistanceM?: number
  maxSpeedMbps?: number
}

/** El seed completo: es lo que consumen las reglas (`lintSeed`) y `loadSeed`. */
export interface SeedCatalogs {
  categories: readonly SeedCategory[]
  manufacturers: readonly SeedManufacturer[]
  sources: readonly SeedSource[]
  protocols: readonly SeedProtocol[]
  standards: readonly SeedStandard[]
  media: readonly SeedMedium[]
  devices: readonly SeedDevice[]
}
