/**
 * Contrato de almacenamiento del servidor (F8A, NET-HW-062).
 *
 * El servidor NO conoce detalles de motor: la API consume este port. Los
 * adaptadores (SQLite local por defecto; PostgreSQL con la misma interfaz)
 * son intercambiables sin tocar rutas ni dominio (§6.7 — prueba ácida de la
 * fase: adaptador nuevo, cero cambios en packages/domain ni en vistas).
 */
import type {
  OutboxEntry,
  SyncAttributeDefinition,
  SyncCatalogs,
  SyncDeviceDetail,
  SyncSource,
} from '@netatlas/domain'

export interface ServerDevice {
  readonly slug: string
  readonly name: string
  readonly manufacturerSlug: string
  readonly categoryCode: string
  readonly categoryName: string
  readonly lifecycleStatus: string
}

export interface ServerHit {
  readonly slug: string
  readonly name: string
  readonly score: number
}

export interface ServidorStore {
  /** Ficha plana por slug (undefined → 404). */
  describe(slug: string): Promise<ServerDevice | undefined>
  /** Búsqueda por DSL/texto libre (score opaco). */
  search(q: string, limit: number): Promise<readonly ServerHit[]>
  /** Categorías del catálogo (para claves/validación). */
  categorias(): Promise<readonly { code: string; nameEs: string }[]>
  /** Snapshot de catálogo desde una versión (0 = completa). */
  snapshot(since: number): Promise<readonly ServerSnapshotRow[]>
  /** Aristas de topología entre dispositivos (para el mapa/arquitectura UI). */
  snapshotLinks(since: number): Promise<readonly SnapshotLink[]>
  /** Detalle por dispositivo (ficha completa sin N+1): puertos, aristas de
   *  catálogo, afirmaciones, EAV + catálogos y fuentes. Vacío si since >= version. */
  snapshotDetail(since: number): Promise<SnapshotDetail>
  /** Versión actual del catálogo lado servidor. */
  version(): Promise<number>
  /** Recibe contribuciones (outbox del cliente) y devuelve las aceptadas. */
  recibirContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]>
  /** Conjuntos de datos descargables firmados (§31.3 / F8B futuro). */
  conjuntosDeDatos(): Promise<readonly DatasetPublico[]>
}

/** Conjunto de datos descargable: manifiesto firmado + blob del SQLite. */
export interface DatasetPublico {
  readonly nombre: string
  /** Manifiesto del dataset (conteos + SHA-256 + firma Ed25519 si existe). */
  readonly manifiesto: Record<string, unknown>
  /** Blob del archivo SQLite (para descarga directa). */
  readonly blob: Blob
  /** SHA-256 del blob (debe coincidir con manifiesto.sha256). */
  readonly sha256: string
}

/** Fila de snapshot: datos planos de dispositivos + versión de cambio. */
export interface ServerSnapshotRow {
  readonly slug: string
  readonly name: string
  readonly manufacturerSlug: string
  readonly categoryCode: string
  readonly lifecycleStatus: string
  readonly updatedAt: string
  readonly version: number
}

/** Detalle del snapshot F8B (transporta la ficha sin N+1). */
export interface SnapshotDetail {
  readonly devices: readonly SyncDeviceDetail[]
  readonly catalogs: SyncCatalogs
  readonly sources: readonly SyncSource[]
  readonly attributeDefinitions: readonly SyncAttributeDefinition[]
}

/** Detalle vacío (deltas sin cambios + stub PostgreSQL sin topología). */
export const EMPTY_SNAPSHOT_DETAIL: SnapshotDetail = {
  devices: [],
  catalogs: { protocols: [], standards: [], media: [], layers: [], manufacturers: [] },
  sources: [],
  attributeDefinitions: [],
}

/** Arista resuelta de topología entre dos dispositivos (snake-case plano). */
export interface SnapshotLink {
  /** Slug del dispositivo origen (subject). */
  readonly from: string
  /** Slug del dispositivo destino (object). */
  readonly to: string
  /** Predicado de la arista (domain-validado en el cliente). */
  readonly predicate: string
}

/** Driver SQL neutral para los adaptadores (SQLite y Postgres lo implementan). */
export interface SqlExecutor {
  /** Consulta con parámetros; devuelve filas como objectos planos. */
  query<T>(sql: string, params?: readonly (string | number | null)[]): Promise<readonly T[]>
  /** Ejecuta una sentencia DML; devuelve cambios. */
  exec(sql: string, params?: readonly (string | number | null)[]): Promise<{ changes: number }>
}