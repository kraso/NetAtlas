#!/usr/bin/env tsx
/**
 * netatlas:server:e2e — arranca el backend para la suite Playwright (F8A).
 *
 * Al contrario que `server`, usa una COPIA TEMPORAL del seed (no escribe tablas
 * runtime en datasets/netatlas-seed.sqlite) y un token fijo para que el E2E
 * navegador (cola local → sync) pueda autenticarse sin config:
 *
 *   NETATLAS_E2E_PORT=8787 pnpm --filter @netatlas/server server:e2e
 *
 * Sirve el mismo middleware (API /api de sync + /v1 pública + openapi.json).
 */
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { NodeSqliteDriver } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import {
  SqliteServidorStore,
  SqliteExecutor,
  SqlitePublicStore,
  StaticBearerVerifier,
  crearServidor,
  crearApiPublica,
} from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const TOKEN_E2E = 'token-e2e-netatlas'

async function main(): Promise<void> {
  const seed = join(here, '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')
  if (!existsSync(seed)) {
    throw new Error(`No existe el seed en ${seed} — ejecuta pnpm dataset:build`)
  }

  // Copia efímera: el servidor puede escribir (outbox del servidor, claves) sin
  // ensuciar el dataset firmado del repo.
  const dir = mkdtempSync(join(tmpdir(), 'netatlas-e2e-'))
  const dbPath = join(dir, 'seed.sqlite')
  copyFileSync(seed, dbPath)

  const driver = new NodeSqliteDriver(dbPath)
  const search = new Fts5SearchIndex(driver)
  const store = new SqliteServidorStore(driver, new SqliteExecutor(driver), search)
  const publicStore = new SqlitePublicStore(driver)
  const base = crearServidor(store, new StaticBearerVerifier(TOKEN_E2E), '0.2.0-e2e')
  const api = crearApiPublica({ store, publicStore, base, limitePorMinuto: 10_000 })

  const port = Number(process.env.NETATLAS_E2E_PORT ?? '8787')
  const server: Server = createServer((req, res) => {
    void api(req, res)
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`netatlas-server e2e escuchando en http://127.0.0.1:${port} (token: ${TOKEN_E2E})`)
  })
  const limpiar = (): void => {
    server.close(() => {
      driver.close()
      rmSync(dir, { recursive: true, force: true })
      process.exit(0)
    })
  }
  process.on('SIGINT', limpiar)
  process.on('SIGTERM', limpiar)
}

void main()