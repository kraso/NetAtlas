import { describe, it, expect } from 'vitest'
import { buildGlobalGraph } from '../src/casos/build-global-graph.js'

describe('buildGlobalGraph', () => {
  it('proyecta aristas category→category al subgrafo UI', () => {
    const input = {
      nodes: [
        { id: 'category:sw', type: 'category', label: 'Switches (100)' },
        { id: 'category:rt', type: 'category', label: 'Routers (50)' },
      ],
      edges: [
        { id: 'c0', source: 'category:sw', target: 'category:rt', predicate: '12 enlaces entre categorías' },
      ],
    }
    const res = buildGlobalGraph(input)

    expect(res.nodes).toHaveLength(2)
    expect(res.edges).toHaveLength(1)
    expect(res.edges[0]?.source).toBe('category:sw')
    expect(res.edges[0]?.target).toBe('category:rt')
    expect(res.predicates[0]?.code).toBe('12 enlaces entre categorías')
  })

  it('vacío sin aristas', () => {
    const res = buildGlobalGraph({ nodes: [], edges: [] })
    expect(res.nodes).toHaveLength(0)
    expect(res.edges).toHaveLength(0)
  })
})
