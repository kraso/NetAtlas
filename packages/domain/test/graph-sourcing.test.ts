import { describe, expect, it } from 'vitest'
import { Relationship, validateReplacedByInvariant } from '../src/graph/graph.js'
import { Source, Assertion } from '../src/sourcing/assertion.js'

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
