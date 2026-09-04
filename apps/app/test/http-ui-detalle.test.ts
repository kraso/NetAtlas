/**
 * F8B-detalle — el pull HTTP transporta la ficha completa sin N+1.
 * Regresión: las pestañas (protocolos, puertos, atributos, referencias)
 * salían vacías porque el snapshot solo traía la fila mínima SyncDevice.
 */
import { describe, expect, it, vi } from 'vitest'
import { fetchDatasetRemoto } from '../src/adapters/http-ui.js'

const CUERPO = {
  version: 2,
  dispositivos: [
    { slug: 'sw-test-1', name: 'Switch Test 1', manufacturerSlug: 'acme', categoryCode: 'CAT-TST', lifecycleStatus: 'current', updatedAt: '2025-01-01', version: 2 },
  ],
  links: [],
  detalle: {
    devices: [
      {
        slug: 'sw-test-1',
        summary: 'Switch de prueba',
        ports: [{ label: '48x 1G', interfaceCode: 'rj45', quantity: 48, speedsMbps: [1000] }],
        relations: [{ predicate: 'supports-protocol', objectType: 'protocol', objectCode: 'ospf' }],
        assertions: [
          {
            predicate: 'throughput_gbps', valueJson: '{"gbps":176}', sourceSlug: 'acme-ds',
            confidence: 'official', verifiedOn: '2025-02-10', author: 'curator-seed',
          },
        ],
        attributeValues: [{ key: 'throughput_gbps', display: '176' }],
      },
    ],
    catalogs: {
      protocols: [{ code: 'ospf', name: 'OSPF', family: 'routing', osiLayer: 3 }],
      standards: [],
      media: [],
      layers: [],
      manufacturers: [{ slug: 'acme', snmpEnterprise: 99999 }],
    },
    sources: [
      { slug: 'acme-ds', kind: 'datasheet', title: 'Acme DS', authorityLevel: 1 },
    ],
    attributeDefinitions: [
      {
        key: 'throughput_gbps', labelEs: 'Capacidad', valueType: 'number',
        isFacet: true, isComparable: true, compareRule: 'higher-better', categoryCode: 'CAT-TST',
      },
    ],
  },
}

function fetchMock(): typeof fetch {
  return (async (url: unknown) => {
    const u = String(url)
    if (u.endsWith('/api/categories')) {
      return { ok: true, json: async () => ({ categorias: [] }) }
    }
    return { ok: true, json: async () => CUERPO }
  }) as unknown as typeof fetch
}

describe('fetchDatasetRemoto con detalle F8B', () => {
  it('expone puertos, resumen y perfil en el Device', async () => {
    const data = await fetchDatasetRemoto('http://127.0.0.1:8787', fetchMock())
    const dev = data.devices.find((d) => d.slug.value === 'sw-test-1')
    expect(dev).toBeDefined()
    expect(dev!.summary).toBe('Switch de prueba')
    expect(dev!.ports).toHaveLength(1)
    expect(dev!.ports[0]!.label).toBe('48x 1G')
  })

  it('expone aristas supports-protocol con slug de protocolo', async () => {
    const data = await fetchDatasetRemoto('http://127.0.0.1:8787', fetchMock())
    const rels = data.relationships.filter((r) => r.predicate === 'supports-protocol')
    expect(rels).toHaveLength(1)
    expect(rels[0]!.object).toMatchObject({ type: 'protocol', slug: 'ospf' })
  })

  it('expone valores EAV y afirmaciones con fuente', async () => {
    const data = await fetchDatasetRemoto('http://127.0.0.1:8787', fetchMock())
    const valores = data.deviceAttributeValues ?? []
    expect(valores.filter((v) => v.deviceSlug === 'sw-test-1')).toHaveLength(1)
    expect(data.assertions).toHaveLength(1)
    expect(data.assertions[0]!.predicate).toBe('throughput_gbps')
    expect(data.assertions[0]!.source.title).toBe('Acme DS')
    expect(data.protocols ?? []).toHaveLength(1)
  })

  it('propaga la empresa SNMP del fabricante', async () => {
    const data = await fetchDatasetRemoto('http://127.0.0.1:8787', fetchMock())
    const mfr = data.manufacturers.find((m) => m.slug.value === 'acme')
    expect(mfr?.snmpEnterprise).toBe(99999)
  })

  it('descarta filas invalidas sin tumbar el pull', async () => {
    const roto = JSON.parse(JSON.stringify(CUERPO)) as typeof CUERPO
    roto.detalle.devices[0]!.relations.push({ predicate: 'no-existe', objectType: 'protocol', objectCode: 'x' })
    roto.detalle.devices[0]!.ports.push({ label: '', interfaceCode: 'rj45', quantity: 0, speedsMbps: [] })
    const fetchRoto = (async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/api/categories')) return { ok: true, json: async () => ({ categorias: [] }) }
      return { ok: true, json: async () => roto }
    }) as unknown as typeof fetch
    const data = await fetchDatasetRemoto('http://127.0.0.1:8787', fetchRoto)
    expect(data.devices).toHaveLength(1)
    expect(data.devices[0]!.ports).toHaveLength(1)
    expect(data.relationships.filter((r) => r.predicate === 'supports-protocol')).toHaveLength(1)
  })
})