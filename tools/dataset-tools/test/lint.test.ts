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

  // Regresión: 42 assertions de 18 dispositivos citaban el criterio editorial del
  // hub 3Com (el documento de OTRO dispositivo) para justificar protocolos que
  // ese documento no cubre.
  it('rechaza que un dispositivo cite el documento declarado por otro (fuente ajena)', () => {
    const base = {
      categories: [{ code: 'CAT-SWT', nameEs: 'Switching' }],
      manufacturers: [{ slug: 'acme', name: 'Acme' }],
      sources: [
        { slug: 'doc-a', kind: 'datasheet', title: 'Doc A', authorityLevel: 1 },
        { slug: 'doc-b', kind: 'datasheet', title: 'Doc B', authorityLevel: 1 },
        { slug: 'criterio-general', kind: 'editorial', title: 'Criterio', authorityLevel: 3 },
      ],
      protocols: [{ code: 'ospf', name: 'OSPF', family: 'internet', osiLayer: 3 }],
      standards: [],
      media: [],
    }
    const device = (slug: string, sourceSlug: string, declara = 'doc-a') => ({
      slug,
      name: slug,
      manufacturerSlug: 'acme',
      categoryCode: 'CAT-SWT',
      lifecycleStatus: 'current',
      assertions: [{ predicate: 'supports-protocol', value: 'ospf', sourceSlug, confidence: 'third-party' }],
      datasheets: [{ title: 'Doc', sourceSlug: declara }],
    })
    // criterio-general no lo declara ningún dispositivo → fuente compartida.
    const propios = lintSeed({ ...base, devices: [device('sw-1', 'doc-a'), device('sw-2', 'criterio-general', 'doc-b')] })
    expect(propios.issues.filter((i) => i.rule === 'assertion-source-ajena')).toEqual([])

    // sw-2 declara doc-b pero cita doc-a, que es de sw-1.
    const ajenos = lintSeed({ ...base, devices: [device('sw-1', 'doc-a'), device('sw-2', 'doc-a', 'doc-b')] })
    const problema = ajenos.issues.find((i) => i.rule === 'assertion-source-ajena')
    expect(problema?.severity).toBe('error')
    expect(problema?.message).toContain('sw-2')
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