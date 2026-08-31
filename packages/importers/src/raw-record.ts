/**
 * Esquema intermedio (RawRecord) del pipeline de importación (§19.2).
 * Los adaptadores de formato (CSV/JSON/YAML/XML) producen RawRecord[];
 * el resto del pipeline opera solo sobre este tipo.
 */

export interface RawPort {
  readonly label: string
  readonly interfaceCode: string
  readonly quantity: number
  readonly speedsMbps: readonly number[]
  readonly poeStandard?: string
  readonly role?: string
}

export interface RawAssertion {
  readonly predicate: string
  readonly value: unknown
  readonly sourceSlug: string
  readonly confidence?: string
  readonly verifiedOn?: string
  readonly note?: string
}

export interface RawRelationship {
  readonly predicate: string
  readonly objectType: string
  readonly objectSlug: string
}

export interface RawDevice {
  readonly slug?: string
  readonly name: string
  readonly commercialName?: string
  readonly manufacturerSlug: string
  readonly familySlug?: string
  readonly categoryCode: string
  readonly model?: string
  readonly sku?: string
  readonly lifecycleStatus: string
  readonly summary?: string
  readonly releasedOn?: string
  readonly eolOn?: string
  readonly eosOn?: string
  readonly osiProfile?: { terminate: number[]; transparent: number[]; primary: number }
  readonly ports?: readonly RawPort[]
  readonly assertions?: readonly RawAssertion[]
  readonly relationships?: readonly RawRelationship[]
  /** Procedencia: archivo/línea (para el informe). */
  readonly source?: { file: string; line?: number }
}

/** Registro crudo genérico antes de especializar a RawDevice. */
export interface RawRecord {
  readonly device: RawDevice
  readonly source?: { file: string; line?: number }
}

export function toRawRecord(device: RawDevice, file?: string, line?: number): RawRecord {
  return { device: { ...device, source: { file: file ?? 'memoria', line } } }
}