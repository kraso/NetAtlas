import { describe, expect, it } from 'vitest'
import {
  dedupScore,
  diffCampos,
  evaluarCompatibilidad,
  diffManifiestos,
  jaccard,
  tokens,
} from '../src/index.js'
import type { DatasetManifest, DedupCandidate } from '../src/index.js'

const base: DedupCandidate = { manufacturerSlug: 'cisco', name: 'Cisco Catalyst 9300-48P', model: 'WS-C9300-48P', sku: 'WS-C9300-48P', categoryCode: 'CAT-SWT-L3' }

describe('Dedup con scoring (NET-HW-045, §19.2-4)', () => {
  it('identifica el mismo dispositivo → fusión automática (≥0.98)', () => {
    const r = dedupScore(base, { ...base })
    expect(r.score).toBeGreaterThanOrEqual(0.98)
    expect(r.decision).toBe('fusion-automatica')
    expect(r.coincidencias).toContain('modelo')
    expect(r.coincidencias).toContain('fabricante')
  })

  it('mismo modelo y fabricante con nombre distinto → candidato a revisión con diff', () => {
    const entrante: DedupCandidate = { ...base, name: 'Catalyst 9300 48P nuevo' }
    const r = dedupScore(entrante, base)
    expect(r.score).toBeGreaterThanOrEqual(0.7)
    expect(r.score).toBeLessThan(0.98)
    expect(r.decision).toBe('candidato-revision')
    expect(r.diferencias.some((d) => d.campo === 'nombre')).toBe(true)
  })

  it('fabricante distinto y modelo distinto → distinto (<0.7)', () => {
    const otro: DedupCandidate = { manufacturerSlug: 'arista', name: 'Arista DCS-7050SX', model: 'DCS-7050', categoryCode: 'CAT-DCN' }
    expect(dedupScore(otro, base).decision).toBe('distinto')
  })

  it('jaccard de tokens compara nombres normalizados', () => {
    expect(jaccard(tokens('Catalyst 9300'), tokens('Catalyst 9300'))).toBe(1)
    expect(jaccard(tokens('Catalyst 9300'), tokens('Catalyst 9200'))).toBeCloseTo(1 / 3)
    expect(jaccard([], [])).toBe(1)
  })

  it('diffCampos produce el lado a lado ordenado', () => {
    const diff = diffCampos({ name: 'A', speed: 100 }, { name: 'B', speed: 100, portas: 48 })
    expect(diff.map((d) => d.campo)).toEqual(['name', 'portas'])
    expect(diff.find((d) => d.campo === 'name')?.entrante).toBe('A')
    expect(diff.find((d) => d.campo === 'portas')?.existente).toBe('48')
  })
})

describe('Manifiesto de dataset (NET-HW-048, §19.4)', () => {
  const manif: DatasetManifest = {
    format: 'netatlas-dataset',
    name: 'netatlas-seed',
    version: '2025-06-01-r3',
    schemaVersion: 1,
    publishedOn: '2025-06-01',
    counts: { dispositivos: 330, relaciones: 1123 },
    sha256: 'abc',
  }

  it('evaluarCompatibilidad respeta el rango de esquema de la app', () => {
    expect(evaluarCompatibilidad(manif, { minSchemaVersion: 1, maxSchemaVersion: 2 }).status).toBe('compatible')
    expect(evaluarCompatibilidad({ ...manif, schemaVersion: 0 }, { minSchemaVersion: 1, maxSchemaVersion: 2 }).status).toBe('obsoleto')
    expect(evaluarCompatibilidad({ ...manif, schemaVersion: 3 }, { minSchemaVersion: 1, maxSchemaVersion: 2 }).status).toBe('futuro')
    expect(evaluarCompatibilidad({ ...manif, format: 'otro' } as unknown as DatasetManifest, { minSchemaVersion: 1, maxSchemaVersion: 2 }).status).toBe('invalido')
  })

  it('diffManifiestos describe los cambios de conteos y changelog', () => {
    const nuevo: DatasetManifest = { ...manif, version: '2025-06-08-r4', counts: { dispositivos: 350, relaciones: 1250 }, changelog: ['+20 dispositivos'] }
    const diff = diffManifiestos(manif, nuevo)
    expect(diff.version).toBe('2025-06-08-r4')
    expect(diff.cambios.some((c) => c.includes('dispositivos: 330 → 350 (+20)'))).toBe(true)
    expect(diff.cambios.some((c) => c.includes('+20 dispositivos'))).toBe(true)
  })
})