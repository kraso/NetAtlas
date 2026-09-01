#!/usr/bin/env tsx
/**
 * netatlas:server — arranca el servidor de sincronización (F8A).
 *
 * Por defecto usa SQLite (datasets/netatlas-seed.sqlite). Para PostgreSQL:
 *   NETATLAS_PG=postgres://user:pass@host/db  (adaptador PostgreSQL)
 * Auth:
 *   NETATLAS_SERVER_TOKEN=mi-secreto            (Bearer estático)
 *   o variables OIDC (NETATLAS_OIDC_ISSUER/JWKS/AUDIENCE)
 *
 *   pnpm server [--port=8787]
 */
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { SqliteServidorStore, SqliteExecutor, PostgresServidorStore } from './index.js'
import type { ServidorStore, PgDriver } from './index.js'
import { StaticBearerVerifier, OidcJwtVerifier } from './index.js'
import type { AuthVerifier } from './index.js'
import { crearServidor } from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}

async function almacen(): Promise<{ store: ServidorStore; close: () => void }> {
  const pgUrl = process.env.NETATLAS_PG
  if (pgUrl) {
    // Adaptador PostgreSQL (NET-HW-062): conexión real por env.
    const { PgConnector } = await import('./index.js') as { PgConnector?: (c: { connectionString: string }) => PgDriver }
    const conector = pgConnectorReal()
    const pg = conector({ connectionString: pgUrl })
    return { store: new PostgresServidorStore(pg), close: () => void pg.close() }
  }

  const dbPath = arg('db') ?? join(here, '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')
  if (!existsSync(dbPath)) {
    throw new Error(`No existe el dataset en ${dbPath} — ejecuta pnpm dataset:build`)
  }
  const driver = new NodeSqliteDriver(dbPath)
  // Migraciones del catálogo (0001/0002) si el archivo es un seed limpio.
  const migrationsDir = join(here, '..', '..', 'data', 'migrations')
  if (existsSync(migrationsDir)) {
    applyMigrations(driver, loadMigrations(migrationsDir))
  }
  const search = new Fts5SearchIndex(driver)
  const store = new SqliteServidorStore(driver, new SqliteExecutor(driver), search)
  return { store, close: () => driver.close() }
}

/** Conector pg real (requiere el paquete `pg` instalado opcionalmente). */
function pgConnectorReal() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (config: { connectionString: string }): PgDriver => new PgRealDriver(config)
}

/** Driver pg real mínimo (usa node-postgres si está instalado). */
class PgRealDriver implements PgDriver {
  private ready: Promise<unknown> | undefined
  private client: unknown

  constructor(private readonly config: { connectionString: string }) {}

  // Lazy: evita el requisito de `pg` cuando no se usa (SQLite es el default).
  private async init(): Promise<unknown> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const mod = await import('pg')
      const Client = mod.Client
      const client = new Client(this.config)
      await client.connect()
      return { client }
    })()
    return this.ready
  }

  async query<T>(sql: string, params: readonly (string | number | null)[] = []): Promise<readonly T[]> {
    const ctx = (await this.init()) as { client: { query(sql: string, params: readonly unknown[]): Promise<{ rows: readonly T[] }> } }
    const r = await ctx.client.query(sql, params)
    return r.rows
  }

  async close(): Promise<void> {
    if (this.ready) {
      const ctx = (await this.ready) as { client: { end(): Promise<void> } }
      await ctx.client.end()
    }
  }
}

function autenticacion(): AuthVerifier {
  const token = process.env.NETATLAS_SERVER_TOKEN
  if (token) return new StaticBearerVerifier(token)
  const issuer = process.env.NETATLAS_OIDC_ISSUER
  const jwksUri = process.env.NETATLAS_OIDC_JWKS
  const audience = process.env.NETATLAS_OIDC_AUDIENCE
  if (issuer && jwksUri && audience) {
    return new OidcJwtVerifier({ issuer, audience, jwksUri })
  }
  throw new Error('Configura NETATLAS_SERVER_TOKEN o las variables OIDC NETATLAS_OIDC_*')
}

async function main(): Promise<void> {
  const { store, close } = await almacen()
  const auth = autenticacion()
  const middleware = crearServidor(store, auth, '0.1.0')
  const port = Number(arg('port') ?? process.env.PORT ?? '8787')

  const server: Server = createServer((req, res) => {
    void middleware(req, res)
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`netatlas-server 0.1.0 escuchando en http://127.0.0.1:${port} (auth: ${process.env.NETATLAS_SERVER_TOKEN ? 'Bearer estático' : 'OIDC'})`)
  })
  process.on('SIGINT', () => {
    server.close(() => {
      void close()
      process.exit(0)
    })
  })
}

void main()