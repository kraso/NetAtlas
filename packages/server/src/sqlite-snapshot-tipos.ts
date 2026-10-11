/** Filas crudas de las consultas del snapshotDetail (F8B-detalle). */

// El mapeo del snapshot consume este contrato: se reexporta aquí para que los
// módulos de mapeo no sumen un import extra (límite de 5 por archivo).
export type { SnapshotDetail } from './store.js'

/** Conjunto completo de filas crudas que alimenta el mapeo del snapshot. */
export interface FilasSnapshot {
  readonly dispositivos: readonly DispositivoRow[]
  readonly puertos: readonly PuertoRow[]
  readonly relaciones: readonly RelacionRow[]
  readonly valores: readonly ValorRow[]
  readonly definiciones: readonly DefinicionRow[]
  readonly afirmaciones: readonly AfirmacionRow[]
  readonly fuentes: readonly FuenteRow[]
  readonly fichas: readonly FichaRow[]
  readonly imagenes: readonly ImagenRow[]
  readonly protocolos: readonly ProtocoloRow[]
  readonly estandares: readonly EstandarRow[]
  readonly medios: readonly MedioRow[]
  readonly capas: readonly CapaRow[]
  readonly fabricantes: readonly FabricanteRow[]
}

export interface DispositivoRow {
  slug: string
  summary: string | null
  osi_profile_json: string | null
}

export interface PuertoRow {
  device_slug: string
  label: string
  interface_code: string
  quantity: number
  speeds_json: string | null
  poe_standard: string | null
  role: string | null
  notes: string | null
}

export interface RelacionRow {
  device_slug: string
  predicate: string
  object_type: string
  object_code: string
  /** Fuente que respalda la arista; NULL si es curada (sin assertion). */
  source_slug: string | null
}

export interface ValorRow {
  device_slug: string
  key: string
  value_type: string
  value_number: number | null
  value_text: string | null
  value_bool: number | null
}

export interface DefinicionRow {
  key: string
  label_es: string
  value_type: string
  unit: string | null
  enum_json: string | null
  is_facet: number
  is_comparable: number
  compare_rule: string
  category_code: string
}

export interface AfirmacionRow {
  subject_slug: string
  predicate: string
  value_json: string
  source_slug: string
  confidence: string
  verified_on: string | null
  author: string | null
  reviewed_by: string | null
  note: string | null
}

export interface FuenteRow {
  slug: string
  kind: string
  publisher: string | null
  title: string
  url: string | null
  retrieved_on: string | null
  authority_level: number
}

export interface FichaRow {
  device_slug: string
  title: string
  language: string
  url: string | null
  local_path: string | null
  source_slug: string
}

export interface ImagenRow {
  device_slug: string
  kind: string
  caption: string | null
  local_path: string | null
  url: string | null
  source_slug: string
}

export interface ProtocoloRow {
  code: string
  name: string
  family: string
  osi_layer: number
}

export interface EstandarRow {
  org: string
  identifier: string
  title: string
}

export interface MedioRow {
  code: string
  kind: string
  name: string
  max_speed_mbps: number | null
}

export interface CapaRow {
  number: number
  name_es: string
}

export interface FabricanteRow {
  slug: string
  snmp_enterprise: number | null
}
