import { describe, expect, it } from 'vitest'
import {
  Relationship,
  findPredicate,
  requirePredicate,
  graphNodeId,
  findCycles,
  PREDICATES,
} from '../src/graph/graph.js'

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
