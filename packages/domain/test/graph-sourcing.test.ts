import { describe, expect, it } from 'vitest'
import {
  Relationship,
  findPredicate,
  requirePredicate,
  graphNodeId,
  findCycles,
  validateReplacedByInvariant,
  PREDICATES,
} from '../src/graph/graph.js'
import { Source, Assertion } from '../src/sourcing/assertion.js'

describe('Predicados', () => {
  it('catálogo cerrado contiene los 20 predicados de la v1', () => {
    expect(PREDICATES).toHaveLength(20)
    const codes = PREDICATES.map((p) => p.code)
    for (const required of [
      'manufactured-by',
      'supports-protocol',
      'operates-at-layer',
      'compatible-with',
      'succeeds',
      'precedes',
      'replaced-by',
      'evolves-into',
    ]) {
      expect(codes).toContain(required)
    }
  })

  it('succeeds/precedes son inversos y acíclicos', () => {
    const suc = findPredicate('succeeds')!
    expect(suc.inverseCode).toBe('precedes')
    expect(suc.acyclic).toBe(true)
    const pre = findPredicate('precedes')!
    expect(pre.inverseCode).toBe('succeeds')
  })

  it('compatible-with es simétrico; manufactured-by es cardinalidad one', () => {
    expect(findPredicate('compatible-with')!.symmetric).toBe(true)
    expect(findPredicate('manufactured-by')!.cardinality).toBe('one')
  })

  it('requirePredicate lanza para códigos desconocidos', () => {
    expect(() => requirePredicate('no-existe')).toThrow()
  })
})

describe('Relationship', () => {
  it('valida dominio/rango del predicado', () => {
    const rel = () =>
      Relationship.create({
        subject: { type: 'device', slug: 'sw-1' },
        predicate: 'manufactured-by',
        object: { type: 'manufacturer', slug: 'aruba' },
        validFrom: '2020-01-01',
      })
    expect(rel).not.toThrow()
  })

  it('rechaza objeto fuera de rango', () => {
    expect(() =>
      Relationship.create({
        subject: { type: 'device', slug: 'sw-1' },
        predicate: 'manufactured-by',
        object: { type: 'protocol', slug: 'ospf' },
        validFrom: '2020-01-01',
      }),
    ).toThrow(/rango/)
  })

  it('genera ids de nodo estables', () => {
    expect(graphNodeId({ type: 'device', slug: 'sw-1' })).toBe('device:sw-1')
  })
})

describe('findCycles', () => {
  it('detecta ciclos en predicados acíclicos', () => {
    const rels = [
      Relationship.create({
        subject: { type: 'device', slug: 'a' },
        predicate: 'succeeds',
        object: { type: 'device', slug: 'b' },
        validFrom: '2020-01-01',
      }),
      Relationship.create({
        subject: { type: 'device', slug: 'b' },
        predicate: 'succeeds',
        object: { type: 'device', slug: 'a' },
        validFrom: '2020-01-01',
      }),
    ]
    const cycles = findCycles(rels, ['succeeds'])
    expect(cycles.length).toBeGreaterThan(0)
  })

  it('no reporta ciclos en un DAG válido', () => {
    const rels = [
      Relationship.create({
        subject: { type: 'category', slug: 'hub' },
        predicate: 'evolves-into',
        object: { type: 'category', slug: 'bridge' },
        validFrom: '2020-01-01',
      }),
      Relationship.create({
        subject: { type: 'category', slug: 'bridge' },
        predicate: 'evolves-into',
        object: { type: 'category', slug: 'switch-l2' },
        validFrom: '2020-01-01',
      }),
    ]
    expect(findCycles(rels, ['evolves-into'])).toHaveLength(0)
  })
})

describe('validateReplacedByInvariant', () => {
  it('obliga a estado EoL+ en el sujeto de replaced-by', () => {
    const rels = [
      Relationship.create({
        subject: { type: 'device', slug: 'catalyst-2920' },
        predicate: 'replaced-by',
        object: { type: 'device', slug: 'catalyst-2930f' },
        validFrom: '2020-01-01',
      }),
    ]
    const statuses = new Map<string, string>([
      ['catalyst-2920', 'eol'],
      ['catalyst-2930f', 'current'],
    ])
    expect(validateReplacedByInvariant(rels, { deviceStatus: (s) => statuses.get(s) })).toHaveLength(0)

    statuses.set('catalyst-2920', 'current')
    const errors = validateReplacedByInvariant(rels, { deviceStatus: (s) => statuses.get(s) })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('eol')
  })
})

describe('Source / Assertion', () => {
  it('construye afirmación oficial con trazabilidad completa', () => {
    const src = Source.create({
      slug: 'aruba-2930f-datasheet',
      kind: 'datasheet',
      publisher: 'Aruba Networks',
      title: 'Aruba 2930F Data Sheet',
      url: 'https://www.arubanetworks.com/',
      retrievedOn: '2025-02-10',
      authorityLevel: 1,
    })
    const a = Assertion.create({
      subjectType: 'device',
      subjectId: 1,
      predicate: 'throughput_gbps',
      valueJson: '{"gbps":176}',
      source: src,
      confidence: 'official',
      verifiedOn: '2025-02-10',
      author: 'curator-1',
      reviewedBy: 'reviewer-1',
    })
    expect(a.confidence).toBe('official')
    expect(a.pendingReview).toBe(false)
    expect(src.retrievedOn).toBe('2025-02-10')
  })

  it('marca pendiente de revisión sin reviewer', () => {
    const src = Source.create({
      slug: 's1',
      kind: 'editorial',
      title: 'Criterio editorial',
      authorityLevel: 4,
    })
    const a = Assertion.create({
      subjectType: 'device',
      subjectId: 1,
      predicate: 'similar-to',
      valueJson: '{}',
      source: src,
      confidence: 'third-party',
      verifiedOn: '2025-02-10',
      author: 'curator-1',
    })
    expect(a.pendingReview).toBe(true)
  })

  it('rechaza confianza desconocida', () => {
    expect(() =>
      Source.create({ slug: 's1', kind: 'editorial', title: 'x', authorityLevel: 4 }),
    ).not.toThrow()
    const src = Source.create({ slug: 's1', kind: 'editorial', title: 'x', authorityLevel: 4 })
    expect(() =>
      Assertion.create({
        subjectType: 'device',
        subjectId: 1,
        predicate: 'x',
        valueJson: '{}',
        source: src,
        // @ts-expect-error confianza intencionalmente inválida
        confidence: 'inventada',
        verifiedOn: '2025-02-10',
        author: 'curator-1',
      }),
    ).toThrow()
  })
})