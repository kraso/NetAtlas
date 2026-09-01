/**
 * Contrato de almacenamiento del servidor (F8A, NET-HW-062).
 *
 * El servidor NO conoce detalles de motor: la API consume este port. Los
 * adaptadores (SQLite local por defecto; PostgreSQL con la misma interfaz)
 * son intercambiables sin tocar rutas ni dominio (§6.7 — prueba ácida de la
 * fase: adaptador nuevo, cero cambios en packages/domain ni en vistas).
 */
import type { OutboxEntry } from '@netatlas/domain'

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
  /** Versión actual del catálogo lado servidor. */
  version(): Promise<number>
  /** Recibe contribuciones (outbox del cliente) y devuelve las aceptadas. */
  recibirContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]>
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

/** Driver SQL neutral para los adaptadores (SQLite y Postgres lo implementan). */
export interface SqlExecutor {
  /** Consulta con parámetros; devuelve filas como objectos planos. */
  query<T>(sql: string, params?: readonly (string | number | null)[]): Promise<readonly T[]>
  /** Ejecuta una sentencia DML; devuelve cambios. */
  exec(sql: string, params?: readonly (string | number | null)[]): Promise<{ changes: number }>
}