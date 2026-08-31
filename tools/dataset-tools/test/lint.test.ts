import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { lintSeed, loadSeed } from '../src/lint.js'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = join(here, '..', '..', '..', 'datasets', 'seed')

let seed: ReturnType<typeof loadSeed>

describe('data:lint — dataset seed', () => {
  beforeAll(() => {
    seed = loadSeed(seedDir)
  })

  it('carga las 15 macrocategorías y 20 fichas piloto', () => {
    expect(seed.categories.length).toBeGreaterThanOrEqual(20)
    expect(seed.devices.length).toBe(18)
    expect(seed.manufacturers.length).toBeGreaterThanOrEqual(10)
    expect(seed.sources.length).toBeGreaterThanOrEqual(5)
  })

  it('no produce errores de invariantes', () => {
    const report = lintSeed(seed)
    const errors = report.issues.filter((i) => i.severity === 'error')
    expect(errors).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('toda categoría referenciada por dispositivos existe en el árbol', () => {
    const codes = new Set(seed.categories.map((c) => c.code))
    for (const dev of seed.devices) {
      expect(codes.has(dev.categoryCode), `categoría ${dev.categoryCode}`).toBe(true)
    }
  })
})