import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { NodeSqliteDriver } from '@netatlas/data'
import { buildSeedDatabase } from '../src/build.js'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = join(here, '..', '..', '..', 'datasets', 'seed')
const tmpDir = mkdtempSync(join(tmpdir(), 'netatlas-build-'))
const outPath = join(tmpDir, 'seed.sqlite')

describe('dataset:build', () => {
  let result: ReturnType<typeof buildSeedDatabase>
  let driver: NodeSqliteDriver

  beforeAll(() => {
    result = buildSeedDatabase(seedDir, outPath)
    driver = new NodeSqliteDriver(outPath)
  })

  afterAll(() => {
    driver?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('construye el SQLite con dispositivos, aristas y assertions', () => {
    expect(result.deviceCount).toBe(18)
    expect(result.assertionCount).toBeGreaterThan(0)
    expect(result.relationshipCount).toBeGreaterThan(0)
    expect(result.schemaVersion).toBe(1)
  })

  it('persiste predicados, capas y FTS sincronizado', () => {
    const predicates = driver.prepare('SELECT COUNT(*) AS c FROM predicate').get()
    expect(Number(predicates?.c)).toBe(16)
    const layers = driver.prepare('SELECT COUNT(*) AS c FROM osi_layer').get()
    expect(Number(layers?.c)).toBe(7)
    const fts = driver.prepare('SELECT COUNT(*) AS c FROM fts_device').get()
    expect(Number(fts?.c)).toBe(18)
  })

  it('los dispositivos del seed son consultables por FTS5', () => {
    const hit = driver
      .prepare("SELECT rowid FROM fts_device WHERE fts_device MATCH '2930F'")
      .get()
    expect(hit).toBeDefined()
  })
})