import type { SyncCatalogs, SyncDevice, SyncDeviceDetail, SyncSource, SyncAttributeDefinition } from '@netatlas/domain'

/** Shape plano del `links[]` serializado por el API F8B (`/api/snapshot`). */
export interface SnapshotLink {
  readonly from: string
  readonly to: string
  readonly predicate: string
}

/** Cuerpo de `/api/snapshot?since=0` (dispositivos + detalle F8B-detalle). */
export interface SnapshotBody {
  readonly version: number
  readonly dispositivos: readonly SyncDevice[]
  readonly links?: readonly SnapshotLink[]
  readonly detalle?: {
    readonly devices: readonly SyncDeviceDetail[]
    readonly catalogs: SyncCatalogs
    readonly sources: readonly SyncSource[]
    readonly attributeDefinitions: readonly SyncAttributeDefinition[]
  }
}

export const DEFAULT_API = 'http://127.0.0.1:8787'

/** Valores cerrados que el snapshot puede traer (se descartan filas ajenas). */
export const SOURCE_KINDS = new Set(['datasheet', 'manual', 'rfc', 'ieee', 'web-oficial', 'libro', 'terceros', 'editorial'])
export const CONFIDENCES = new Set(['official', 'derived', 'third-party', 'experimental', 'historical'])
export const VALUE_TYPES = new Set(['number', 'text', 'enum', 'bool', 'range'])
export const COMPARE_RULES = new Set(['higher-better', 'lower-better', 'set-compare', 'none'])
export const OBJECT_TYPES = { protocol: 'protocol', standard: 'standard', layer: 'layer', medium: 'medium', device: 'device' } as const
/** Tipos de imagen aceptados por el dominio (el resto se descarta del pull). */
export const IMAGE_KINDS: ReadonlySet<string> = new Set(['frontal', 'trasera', 'lateral', 'interior', 'panel'])
