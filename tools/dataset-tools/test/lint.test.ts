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

  it('alcanza el objetivo de seed 300+ dispositivos (28.1.5)', () => {
    expect(seed.devices.length).toBeGreaterThanOrEqual(300)
  })

  it('carga los catálogos master del MVP (28.1.5)', () => {
    expect(seed.protocols.length).toBeGreaterThanOrEqual(100)
    expect(seed.standards.length).toBeGreaterThanOrEqual(80)
    expect(seed.media.length).toBeGreaterThanOrEqual(25)
    expect(seed.manufacturers.length).toBeGreaterThanOrEqual(30)
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

  it('cobertura de fuentes en datos críticos ≥ 80% (criterio 28.1.6#2)', () => {
    const criticos = seed.devices.flatMap((d) => d.assertions ?? [])
    expect(criticos.length).toBeGreaterThan(0)
    const conFuente = criticos.filter((a) => a.sourceSlug?.trim().length).length
    expect(conFuente / criticos.length).toBeGreaterThanOrEqual(0.8)
  })

  it('todo protocolo de assertion supports-protocol existe en el catálogo (8.6-1)', () => {
    const codes = new Set(seed.protocols.map((p) => p.code))
    for (const dev of seed.devices) {
      for (const a of dev.assertions ?? []) {
        if (a.predicate === 'supports-protocol' && typeof a.value === 'string') {
          expect(codes.has(a.value), `protocolo ${a.value}`).toBe(true)
        }
      }
    }
  })
})