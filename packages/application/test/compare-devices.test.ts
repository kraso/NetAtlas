import { describe, it, expect } from 'vitest'
import { Device, Port } from '@netatlas/domain'
import { compareDevicesUseCase } from '../src/casos/compare-devices.js'
import type { DevicePort, AttributesPort } from '../src/index.js'
import type { Relationship, GraphRepository } from '@netatlas/domain'

function makeDevice(slug: string, opts: { category: string; ports: number; poeBudget?: number }): Device {
  return Device.create({
    slug,
    name: `Switch ${slug}`,
    manufacturerSlug: 'cisco',
    categoryCode: opts.category,
    lifecycleStatus: 'current',
    ports: [
      Port.create({
        label: 'Gi1/0/1',
        interfaceCode: 'rj45-1g',
        quantity: opts.ports,
        speedsMbps: [1000],
      }),
    ],
  })
}

function deviceRepo(devices: Device[]): DevicePort {
  const map = new Map(devices.map((d) => [d.slug.value, d]))
  return {
    findBySlug: async (slug: string) => map.get(slug),
    listByCategory: async () => ({ items: [], nextCursor: undefined }),
    findByManufacturer: async () => ({ items: [], nextCursor: undefined }),
    count: async () => devices.length,
  }
}

function attributesRepo(vals: Record<string, Array<{ key: string; labelEs: string; valueType: string; display: string; unit?: string }>>): AttributesPort {
  return {
    attributeDefinitionsByCategory: async () => [],
    attributeValuesForDevice: async (slug: string) => (vals[slug] ?? []).map((v) => ({ ...v, valueType: v.valueType as any })),
  }
}

function graphRepo(edges: Relationship[]): GraphRepository {
  return {
    neighbors: async () => edges,
    paths: async () => [],
    edgesOf: async () => edges,
  }
}

describe('compareDevicesUseCase', () => {
  it('devuelve null con menos de 2 slugs', async () => {
    const res = await compareDevicesUseCase(
      { devices: deviceRepo([]), attributes: attributesRepo({}), graph: graphRepo([]) },
      { slugs: ['sw-1'] },
    )
    expect(res).toBeNull()
  })

  it('produce un reporte con diferencias detectadas', async () => {
    const sw1 = makeDevice('sw-a', { category: 'CAT-SWT-L2', ports: 24 })
    const sw2 = makeDevice('sw-b', { category: 'CAT-SWT-L2', ports: 48 })
    const repo = deviceRepo([sw1, sw2])
    const attrs = attributesRepo({
      'sw-a': [{ key: 'throughput_gbps', labelEs: 'Throughput', valueType: 'number', display: '100', unit: 'Gbps' }],
      'sw-b': [{ key: 'throughput_gbps', labelEs: 'Throughput', valueType: 'number', display: '200', unit: 'Gbps' }],
    })
    const graph = graphRepo([])

    const res = await compareDevicesUseCase({ devices: repo, attributes: attrs, graph }, { slugs: ['sw-a', 'sw-b'] })

    expect(res).not.toBeNull()
    expect(res!.devices).toHaveLength(2)
    expect(res!.transversal).toBe(false)

    // La fila de throughput debe marcar diferencia y el de 200 Gbps como best
    const throughputRow = res!.rows.find((r) => r.key === 'throughput_gbps')
    expect(throughputRow).toBeDefined()
    expect(throughputRow!.allEqual).toBe(false)

    const bestCells = throughputRow!.values.filter((v) => v.isBest)
    expect(bestCells).toHaveLength(1)
    expect(bestCells[0]!.deviceSlug).toBe('sw-b')

    // Debe haber diferencias detectadas
    expect(res!.filasConDiferencias).toBeGreaterThan(0)
  })

  it('marca incompatibilidad declarativa por velocidades disjuntas', async () => {
    const sw1 = Device.create({
      slug: 'sw-fast',
      name: 'Switch fast',
      manufacturerSlug: 'cisco',
      categoryCode: 'CAT-SWT-L2',
      lifecycleStatus: 'current',
      ports: [Port.create({ label: 'Gi1/0/1', interfaceCode: 'rj45-1g', quantity: 24, speedsMbps: [1000] })],
    })
    const sw2 = Device.create({
      slug: 'sw-slow',
      name: 'Switch slow',
      manufacturerSlug: 'cisco',
      categoryCode: 'CAT-SWT-L2',
      lifecycleStatus: 'current',
      ports: [Port.create({ label: 'Gi1/0/1', interfaceCode: 'rj45-100m', quantity: 24, speedsMbps: [100] })],
    })

    const repo = deviceRepo([sw1, sw2])
    const graph = graphRepo([])

    const res = await compareDevicesUseCase(
      { devices: repo, attributes: attributesRepo({}), graph },
      { slugs: ['sw-fast', 'sw-slow'] },
    )

    expect(res).not.toBeNull()
    const incompat = res!.compatibilidades.find((c) => !c.compatible)
    expect(incompat).toBeDefined()
    expect(incompat!.note).toMatch(/Sin interfaz común/)
  })
})
