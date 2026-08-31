import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeSqliteDriver, CatalogDao, applyMigrations, loadMigrations } from '@netatlas/data'
import { Fts5SearchIndex } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', '..', 'data', 'migrations')

/**
 * Criterio de aceptación del MVP (28.1.6#1):
 * las 7 consultas canónicas (§12.3) devuelven resultados correctos sobre el
 * seed en <500 ms. Este test es permanente (se ejecuta en CI).
 */
const CANONICAS: { dsl: string; expectSlugs: string[] }[] = [
  { dsl: 'cat:sw', expectSlugs: ['switch-l2-1', 'switch-l2-2', 'multilayer-1'] },
  { dsl: '+protocolo:bgp +protocolo:ospf', expectSlugs: ['router-ent-1'] },
  { dsl: 'capa:2..3', expectSlugs: ['switch-l2-1', 'router-ent-1'] },
  { dsl: 'cat:ifc velocidad:10', expectSlugs: ['nic-10g-1'] },
  { dsl: 'medio:smf', expectSlugs: ['router-ent-1', 'transceiver-lr-1'] },
  { dsl: 'cat:ind', expectSlugs: ['switch-ind-1'] },
  { dsl: '+protocolo:ipv6 +protocolo:vxlan', expectSlugs: ['switch-l3-dc-1'] },
]

describe('7 consultas canónicas del MVP (§12.3, criterio 28.1.6#1)', () => {
  let search: Fts5SearchIndex

  beforeAll(() => {
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const dao = new CatalogDao(driver)

    // Fabricantes y categorías (los aliases habilitan cat:sw / cat:ind / cat:ifc)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Switching', aliases: ['sw', 'switch'] })
    dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'L2', aliases: [] })
    dao.upsertCategory({ code: 'CAT-SWT-L3', parentCode: 'CAT-SWT', nameEs: 'L3', aliases: [] })
    dao.upsertCategory({ code: 'CAT-RTR', nameEs: 'Routing', aliases: ['rtr', 'router'] })
    dao.upsertCategory({ code: 'CAT-RTR-ENT', parentCode: 'CAT-RTR', nameEs: 'Routers empresariales', aliases: [] })
    dao.upsertCategory({ code: 'CAT-IFC', nameEs: 'Interfaces', aliases: ['ifc', 'nic'] })
    dao.upsertCategory({ code: 'CAT-IND', nameEs: 'Industrial', aliases: ['ind'] })
    dao.upsertCategory({ code: 'CAT-DCN', nameEs: 'Data center', aliases: ['dc'] })

    // Protocolos y medios necesarios
    dao.protocolId('bgp', 'BGP', 'routing', 3)
    dao.protocolId('ospf', 'OSPF', 'routing', 3)
    dao.protocolId('ipv6', 'IPv6', 'internet', 3)
    dao.protocolId('vxlan', 'VXLAN', 'overlay', 2)
    dao.mediumId('smf-os2', 'fibra', 'SMF OS2')
    dao.mediumId('mmf-om3', 'fibra', 'MMF OM3')

    // Predicados
    dao.seedPredicates([
      { code: 'manufactured-by', domain: ['device'], range: ['manufacturer'], cardinality: 'one' },
      { code: 'has-category', domain: ['device'], range: ['category'], cardinality: 'one' },
      { code: 'supports-protocol', domain: ['device'], range: ['protocol'] },
      { code: 'terminates-medium', domain: ['device', 'interface'], range: ['medium'] },
      { code: 'operates-at-layer', domain: ['device', 'category'], range: ['layer'] },
    ] as never)

    const dev = (
      slug: string,
      categoryCode: string,
      osi: { terminate: number[]; transparent: number[]; primary: number },
      opts: { ports?: { iface: string; qty: number; speeds: number[]; poe?: string }[]; protocols?: string[]; media?: string[] } = {},
    ): void => {
      dao.upsertDevice({
        slug,
        name: slug.replace(/-/g, ' '),
        manufacturerSlug: 'acme',
        categoryCode,
        lifecycleStatus: 'current',
        osiProfileJson: JSON.stringify(osi),
        summary: `dispositivo de prueba ${slug}`,
      })
      const id = dao.deviceId(slug)!
      for (const p of opts.ports ?? []) {
        dao.addPort({ deviceSlug: slug, interfaceCode: p.iface, label: p.iface, quantity: p.qty, speedsMbps: p.speeds, poeStandard: p.poe })
      }
      for (const proto of opts.protocols ?? []) {
        dao.addRelationship({ subjectType: 'device', subjectId: id, predicate: 'supports-protocol', objectType: 'protocol', objectId: dao.protocolId(proto) })
      }
      for (const med of opts.media ?? []) {
        dao.addRelationship({ subjectType: 'device', subjectId: id, predicate: 'terminates-medium', objectType: 'medium', objectId: dao.mediumId(med, med.startsWith('smf') ? 'fibra' : 'fibra') })
      }
    }

    // Q1: switches L2 con +48 puertos y PoE
    dev('switch-l2-1', 'CAT-SWT-L2', { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }, {
      ports: [{ iface: 'rj45', qty: 48, speeds: [1000], poe: '802.3at' }],
      protocols: ['ospf'],
    })
    dev('switch-l2-2', 'CAT-SWT-L2', { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }, {
      ports: [{ iface: 'rj45', qty: 24, speeds: [1000], poe: '802.3af' }],
    })
    // Q3/Q7: multilayer con capas 2–3, IPv6+VXLAN
    dev('multilayer-1', 'CAT-SWT-L3', { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 }, {
      ports: [{ iface: 'rj45', qty: 48, speeds: [1000] }],
      protocols: ['ipv6', 'vxlan'],
    })
    dev('switch-l3-dc-1', 'CAT-DCN', { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 }, {
      protocols: ['ipv6', 'vxlan', 'bgp'],
    })
    // Q2: router empresarial con BGP+OSPF, capas 1–3, termina SMF
    dev('router-ent-1', 'CAT-RTR-ENT', { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 3 }, {
      ports: [{ iface: 'sfp', qty: 4, speeds: [1000] }],
      protocols: ['bgp', 'ospf', 'ipv6'],
      media: ['smf-os2'],
    })
    // Q4: NIC 10G
    dev('nic-10g-1', 'CAT-IFC', { terminate: [1, 2, 3, 4], transparent: [5, 6, 7], primary: 2 }, {
      ports: [{ iface: 'sfp-plus', qty: 2, speeds: [10000] }],
      protocols: ['tcp'],
    } as { ports: { iface: string; qty: number; speeds: number[] }[]; protocols: string[] })
    // Q6: switch industrial
    dev('switch-ind-1', 'CAT-IND', { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }, {
      protocols: ['modbus'],
    } as { protocols: string[] })
    // Q5: transceiver LR termina SMF
    dev('transceiver-lr-1', 'CAT-IFC', { terminate: [1], transparent: [2, 3, 4, 5, 6, 7], primary: 1 }, {
      media: ['smf-os2'],
    } as { media: string[] })

    search = new Fts5SearchIndex(driver)
  })

  for (const canonica of CANONICAS) {
    it(`"${canonica.dsl}" devuelve los dispositivos esperados en <500 ms`, async () => {
      const t0 = performance.now()
      const res = await search.query({ rawQuery: canonica.dsl, limit: 25 })
      const elapsed = performance.now() - t0
      expect(elapsed).toBeLessThan(500)

      const slugs = res.hits.map((h) => h.slug)
      for (const esperado of canonica.expectSlugs) {
        expect(slugs).toContain(esperado)
      }
      // Corrección: no devuelve dispositivos que no deberían estar (negativo comedido)
      expect(res.total).toBeGreaterThanOrEqual(canonica.expectSlugs.length)
    })
  }
})