/**
 * Filas de entrada del catálogo (Fase 0): las usan el DAO, el pipeline de
 * importación, datagen y dataset:build.
 */

export interface ManufacturerRow {
  readonly slug: string
  readonly name: string
  readonly country?: string
  readonly website?: string
  readonly snmpEnterprise?: number
}

export interface CategoryRow {
  readonly code: string
  readonly parentCode?: string
  readonly nameEs: string
  readonly aliases: readonly string[]
  readonly sortOrder?: number
  readonly osiProfileJson?: string
}

export interface DeviceRow {
  readonly slug: string
  readonly name: string
  readonly manufacturerSlug: string
  readonly categoryCode: string
  readonly lifecycleStatus: string
  readonly osiProfileJson?: string
  readonly summary?: string
  readonly model?: string
  readonly sku?: string
}

export interface PortRow {
  readonly deviceSlug: string
  readonly interfaceCode: string
  readonly label: string
  readonly quantity: number
  readonly speedsMbps: readonly number[]
  readonly poeStandard?: string
  readonly role?: string
}

export interface SourceRow {
  readonly slug: string
  readonly kind: string
  readonly publisher?: string
  readonly title: string
  readonly url?: string
  readonly retrievedOn?: string
  readonly authorityLevel: number
}

export interface AssertionRow {
  readonly subjectType: string
  readonly subjectId: number
  readonly predicate: string
  readonly valueJson: string
  readonly sourceSlug: string
  readonly confidence: string
  readonly verifiedOn: string
  readonly author: string
  readonly reviewedBy?: string
}

export interface RelationshipRow {
  readonly subjectType: string
  readonly subjectId: number
  readonly predicate: string
  readonly objectType: string
  readonly objectId: number
  readonly validFrom?: string
  readonly assertionId?: number
}

/** Fila de predicado canónico para `seedPredicates`. */
export interface PredicateSeedRow {
  readonly code: string
  readonly domain: readonly string[]
  readonly range: readonly string[]
  readonly cardinality?: string
  readonly symmetric?: boolean
  readonly acyclic?: boolean
  readonly inverse?: string
}

/** Definición de atributo EAV (§9.4) para `defineAttribute`. */
export interface AttributeDefRow {
  readonly categoryCode: string
  readonly key: string
  readonly labelEs: string
  readonly valueType: 'number' | 'text' | 'enum' | 'bool' | 'range'
  readonly unit?: string
  readonly enumValues?: readonly string[]
  readonly isFacet?: boolean
  readonly isComparable?: boolean
  readonly compareRule?: 'higher-better' | 'lower-better' | 'set-compare' | 'none'
}

/** Fila de datasheet para `addDatasheet`. */
export interface DatasheetSeedRow {
  readonly deviceSlug: string
  readonly title: string
  readonly language?: string
  readonly url?: string
  readonly localPath?: string
  readonly sourceSlug: string
}

/** Fila de imagen para `addImage`. */
export interface ImageSeedRow {
  readonly deviceSlug: string
  readonly kind: string
  readonly caption?: string
  readonly localPath?: string
  readonly url?: string
  readonly sourceSlug: string
}
