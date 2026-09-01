import { describe, expect, it } from 'vitest'
import {
  Topology,
  TopologyNode,
  TopologyEdge,
  validateLinkCompatibility,
} from '../src/index.js'
import type { LinkCompatibilityInput } from '../src/index.js'

describe('Módulo de topologías (F4 / §13)', () => {
  const base = {
    slug: 'sucursal-demo',
    name: 'Sucursal de demostración',
    kind: 'reference' as const,
    nodes: [
      { entityType: 'device' as const, entitySlug: 'sw-1', x: 0, y: 0 },
      { entityType: 'device' as const, entitySlug: 'rtr-1', x: 100, y: 100 },
      { entityType: 'category' as const, entitySlug: 'CAT-WLS', x: 200, y: 0, layerHint: 2 },
    ],
    edges: [
      { from: 'device:rtr-1', to: 'device:sw-1', label: 'uplink 1G' },
      { from: 'device:sw-1', to: 'category:CAT-WLS', linkKind: 'link' },
    ],
  }

  it('crea el agregado y expone ids de nodo estables', () => {
    const t = Topology.create(base)
    expect(t.slug.value).toBe('sucursal-demo')
    expect(t.nodes.length).toBe(3)
    expect(t.edges.length).toBe(2)
    expect(t.nodeById('device:sw-1')?.entitySlug).toBe('sw-1')
    expect(t.edges[0]?.id).toBe('device:rtr-1→device:sw-1')
  })

  it('rechaza ids de nodo duplicados y enlaces a nodos inexistentes', () => {
    expect(() =>
      Topology.create({
        ...base,
        nodes: [
          { entityType: 'device', entitySlug: 'sw-1' },
          { entityType: 'device', entitySlug: 'sw-1' },
        ],
        edges: [],
      }),
    ).toThrow(/duplicado/)

    expect(() =>
      Topology.create({ ...base, edges: [{ from: 'device:sw-1', to: 'device:no-existe' }] }),
    ).toThrow(/nodo inexistente/)

    expect(() =>
      Topology.create({ ...base, edges: [{ from: 'device:sw-1', to: 'device:sw-1' }] }),
    ).toThrow(/consigo mismo/)
  })

  it('rechaza enlaces duplicados entre el mismo par', () => {
    expect(() =>
      Topology.create({
        ...base,
        edges: [
          { from: 'device:rtr-1', to: 'device:sw-1' },
          { from: 'device:sw-1', to: 'device:rtr-1' }, // mismo par (sin dirección)
        ],
      }),
    ).toThrow(/duplicado/)
  })

  it('withLayout persiste posiciones de forma inmutable', () => {
    const t = Topology.create(base)
    const moved = t.withLayout([{ nodeId: 'device:sw-1', x: 42, y: 24 }])
    expect(moved.nodeById('device:sw-1')?.x).toBe(42)
    expect(moved.nodeById('device:sw-1')?.y).toBe(24)
    // El original no cambia
    expect(t.nodeById('device:sw-1')?.x).toBe(0)
    // El resto de posiciones se conservan
    expect(moved.nodeById('device:rtr-1')?.x).toBe(100)
    expect(moved.nodes.length).toBe(3)
    expect(moved.edges.length).toBe(2)
  })

  it('validateLinkCompatibility: interfaz común o compatibilidad curada', () => {
    const ok: LinkCompatibilityInput = { fromSpeeds: [1000, 10000], toSpeeds: [10000], curatedCompatible: false }
    expect(validateLinkCompatibility(ok).ok).toBe(true)

    const curada: LinkCompatibilityInput = { fromSpeeds: [100], toSpeeds: [2500], curatedCompatible: true }
    expect(validateLinkCompatibility(curada).ok).toBe(true)

    const invalida: LinkCompatibilityInput = { fromSpeeds: [100], toSpeeds: [2500], curatedCompatible: false }
    const res = validateLinkCompatibility(invalida)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/Sin interfaz común/)
  })

  it('TopologyNode y TopologyEdge validan sus invariantes', () => {
    expect(() => TopologyNode.create({ entityType: 'protocol', entitySlug: 'ospf' })).toThrow(/tipo de entidad/)
    expect(() => TopologyNode.create({ entityType: 'device', entitySlug: 'x', x: Number.NaN })).toThrow(/x debe ser finita/)
    expect(() => TopologyEdge.create({ from: 'a', to: 'a' })).toThrow(/consigo mismo/)
  })
})