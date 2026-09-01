/**
 * Adaptador PostgreSQL del servidor (F8A, NET-HW-062, §6.7).
 *
 * Mismo contrato `ServidorStore` que el adaptador SQLite: la API y el dominio
 * no cambian; solo cambia el motor. El SQL aquí es dialecto PostgreSQL
 * (placeholders $1, $2…; ON CONFLICT … DO UPDATE; LIMIT sin OFFSET inline).
 *
 * El driver se inyecta (`PgDriver`) para poder probar el SQL sin un Postgres
 * real en CI (doble de test) y conectarse a uno en despliegue.
 */

import type { ServidorStore, ServerDevice, ServerHit, ServerSnapshotRow } from './store.js'
import type { OutboxEntry } from '@netatlas/domain'

export interface PgRow {
  [column: string]: string | number | null
}

/** Driver PostgreSQL mínimo (implementación real vía `pg`, doble en tests). */
export interface PgDriver {
  query<T extends PgRow>(sql: string, params?: readonly (string | number | null)[]): Promise<readonly T[]>
  close(): Promise<void>
}

export interface PgConfig {
  readonly connectionString?: string
  readonly host?: string
  readonly port?: number
  readonly database?: string
  readonly user?: string
  readonly password?: string
}

/** Connector opcional: permite inyectar pg sin dependencia dura en imports. */
export interface PgConnector {
  (config: PgConfig): PgDriver
}

/** Traduce el SQL SQLite '?' al estilo PostgreSQL $n (con seguridad de órden). */
export function traducirParametros(sql: string): string {
  let n = 0
  return sql.replace(/\?/g, () => `$${++n}`)
}

export class PostgresServidorStore implements ServidorStore {
  constructor(
    private readonly pg: PgDriver,
    private readonly schema: string = 'netatlas',
  ) {}

  private async ensureSchema(): Promise<void> {
    // Idempotente: tablas de runtime en el schema `netatlas`.
    await this.pg.query(
      traducirParametros(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`),
    )
    await this.pg.query(
      `CREATE TABLE IF NOT EXISTS ${this.schema}.netatlas_contribuciones (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        entidad TEXT NOT NULL,
        autor TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        revision INTEGER NOT NULL
      )`,
    )
  }

  async describe(slug: string): Promise<ServerDevice | undefined> {
    await this.ensureSchema()
    const rows = await this.pg.query<{
      slug: string
      name: string
      manufacturer_slug: string
      category_code: string
      category_name: string
      lifecycle_status: string
    }>(
      traducirParametros(
        `SELECT d.slug, d.name, d.manufacturer_slug, d.category_code,
                c.name_es AS category_name, d.lifecycle_status
         FROM ${this.schema}.device d
         JOIN ${this.schema}.category c ON c.id = d.category_id
         WHERE d.slug = $1`,
      ),
      [slug],
    )
    const r = rows[0]
    if (!r) return undefined
    return {
      slug: String(r.slug),
      name: String(r.name),
      manufacturerSlug: String(r.manufacturer_slug),
      categoryCode: String(r.category_code),
      categoryName: String(r.category_name),
      lifecycleStatus: String(r.lifecycle_status),
    }
  }

  async search(q: string, limit: number): Promise<readonly ServerHit[]> {
    await this.ensureSchema()
    const rows = await this.pg.query<{ slug: string; name: string; score: number }>(
      traducirParametros(
        `SELECT d.slug, d.name, 0 AS score
         FROM ${this.schema}.device d
         JOIN ${this.schema}.category c ON c.id = d.category_id
         WHERE lower(d.name) LIKE $1 OR lower(d.slug) LIKE $1
         ORDER BY d.name
         LIMIT $2`,
      ),
      [`%${q.toLowerCase()}%`, limit],
    )
    return rows.map((r) => ({ slug: String(r.slug), name: String(r.name), score: Number(r.score ?? 0) }))
  }

  async categorias(): Promise<readonly { code: string; nameEs: string }[]> {
    await this.ensureSchema()
    const rows = await this.pg.query<{ code: string; name_es: string }>(
      `SELECT code, name_es FROM ${this.schema}.category ORDER BY code`,
    )
    return rows.map((r) => ({ code: String(r.code), nameEs: String(r.name_es) }))
  }

  async snapshot(since: number): Promise<readonly ServerSnapshotRow[]> {
    await this.ensureSchema()
    const base = await this.version()
    if (since >= base) return []
    const rows = await this.pg.query<PgRow>(
      traducirParametros(
        `SELECT d.slug, d.name, d.manufacturer_slug, d.category_code, d.lifecycle_status,
                COALESCE(d.updated_at, '1970-01-01') AS updated_at, $1 AS version
         FROM ${this.schema}.device d
         WHERE $2 = 0 OR d.id > $2
         ORDER BY d.id
         LIMIT 5000`,
      ),
      [base, since],
    )
    return rows as unknown as ServerSnapshotRow[]
  }

  async version(): Promise<number> {
    await this.ensureSchema()
    const rows = await this.pg.query<{ v: number }>(
      `SELECT COALESCE(MAX(revision), 0) AS v FROM ${this.schema}.netatlas_contribuciones`,
    )
    return Number(rows[0]?.v ?? 0)
  }

  async recibirContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]> {
    await this.ensureSchema()
    const aceptadas: string[] = []
    for (const e of entradas) {
      const existente = await this.pg.query<{ revision: number }>(
        traducirParametros(
          `SELECT revision FROM ${this.schema}.netatlas_contribuciones WHERE id = $1`,
        ),
        [e.id],
      )
      if (existente[0] && Number(existente[0].revision) >= e.revision) continue
      await this.pg.query(
        traducirParametros(
          `INSERT INTO ${this.schema}.netatlas_contribuciones
             (id, tipo, entidad, autor, payload_json, received_at, revision)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, received_at = excluded.received_at`,
        ),
        [e.id, e.tipo, e.entidad, e.autor, JSON.stringify(e.payload), e.createdAt, e.revision],
      )
      aceptadas.push(e.id)
    }
    return aceptadas
  }
}