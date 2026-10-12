import { describe, it, expect } from 'vitest'
import { buildLocalGraph } from '../src/casos/build-local-graph.js'
import type { GraphRepository, GraphNode } from '@netatlas/domain'
import { Relationship } from '@netatlas/domain'

function graphRepo(rels: readonly Relationship[]): GraphRepository {
  return {
    neighbors: async () => rels,
    paths: async () => [],
    edgesOf: async () => rels,
  }
}

const DEVICE_A: GraphNode = { type: 'device', slug: 'sw-a' }
const DEVICE_B: GraphNode = { type: 'device', slug: 'sw-b' }

describe('buildLocalGraph', () => {
  it('proyecta subgrafo local desde GraphRepository.neighbors', async () => {
    const arista = Relationship.create({
      subject: DEVICE_A,
      predicate: 'manufactured-by',
      object: { type: 'manufacturer', slug: 'cisco' },
      validFrom: '2025-01-01',
    })
    const res = await buildLocalGraph({ graph: graphRepo([arista]) }, { node: DEVICE_A, maxDepth: 2 })

    expect(res.nodes).toHaveLength(2)
    expect(res.edges).toHaveLength(1)
    expect(res.edges[0]?.predicate).toBe('manufactured-by')
    expect(res.predicates[0]).toMatchObject({ code: 'manufactured-by', count: 1 })
  })

  it('vacío sin aristas incidentes', async () => {
    const res = await buildLocalGraph({ graph: graphRepo([]) }, { node: DEVICE_A, maxDepth: 1 })
    expect(res.nodes).toHaveLength(0)
    expect(res.edges).toHaveLength(0)
  })
})
