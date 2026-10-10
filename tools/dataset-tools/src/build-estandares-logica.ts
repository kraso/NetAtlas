import type { CatalogDao } from '@netatlas/data'
import type { SeedDevice } from './lint-tipos.js'
import type { Seed } from './build-tipos.js'

/** Conteos de assertions y relaciones creadas durante el seed. */
export interface ConteosSiembra {
  readonly assertionCount: number
  readonly relationshipCount: number
}

/**
 * Lógica de estándares derivados (F2-asistido): extraída de
 * `build-estandares.ts` para mantener el módulo principal por debajo del
 * límite de 200 líneas (§Convenciones).
 */

/** Mapa de protocolo → org/identifier de estándar canónico. */
export const PROTOCOL_STANDARD: Record<string, string> = {
  ospf: 'ietf/2328', bgp: 'ietf/4271', rip: 'ietf/2453', vrrp: 'ietf/5798',
  dhcp: 'ietf/2131', dns: 'ietf/1035', snmp: 'ietf/3411', ntp: 'ietf/5905',
  ssh: 'ietf/4253', radius: 'ietf/2865', netconf: 'ietf/6241', restconf: 'ietf/8040',
  quic: 'ietf/9000', sctp: 'ietf/4960', bfd: 'ietf/5880',
  ipsec: 'ietf/4301', vxlan: 'ietf/7348', 'vxlan-evpn': 'ietf/7348', geneve: 'ietf/8926',
  profinet: 'pi/profinet', 'ethernet-ip': 'odva/ethernet-ip',
  ethernet: 'ieee/802.3', gpon: 'itu-t/G.984', xgspon: 'itu-t/G.9807.1',
  tsn: 'ieee/802.1Qbv', stp: 'ieee/802.1D', rstp: 'ieee/802.1w', mstp: 'ieee/802.1s',
  lldp: 'ieee/802.1ab', lacp: 'ieee/802.1ax', '802.1x': 'ieee/802.1X', '802.1q': 'ieee/802.1Q',
  ipv6: 'ietf/8200', tcp: 'ietf/793', udp: 'ietf/768', icmp: 'ietf/792', arp: 'ietf/826',
  prp: 'iec/62439-3', hsr: 'iec/62439-3', 'iec-61850': 'iec/61850',
  erps: 'itu-t/G.8032', otn: 'itu-t/G.709',
  '802.11a': 'ieee/802.11', '802.11b': 'ieee/802.11', '802.11g': 'ieee/802.11',
  '802.11n': 'ieee/802.11', '802.11ac': 'ieee/802.11', '802.11ax': 'ieee/802.11',
  '802.11be': 'ieee/802.11', wpa2: 'ieee/802.11i', wpa3: 'ieee/802.11i',
}

/** Interfaces Ethernet que implican IEEE 802.3 (capa física). */
const ETHERNET_IFACES = new Set(['rj45', '2.5gbase-t', 'sfp', 'sfp-plus', 'sfp56', 'qsfp-plus', 'qsfp28', 'qsfp56'])

/** Puertos OSFP/QSFP112 implican 800G (802.3df), no 802.3 base. */
const G800_IFACES = new Set(['osfp', 'qsfp112'])

/** Recolecta referencias de estándar de assertions y puertos de un dispositivo. */
function recolectarRefs(dev: SeedDevice): Set<string> {
  const refs = new Set<string>()
  for (const assertion of dev.assertions ?? []) {
    if (assertion.predicate === 'supports-protocol' && typeof assertion.value === 'string') {
      const ref = PROTOCOL_STANDARD[assertion.value]
      if (ref) refs.add(ref)
    }
  }
  for (const port of dev.ports ?? []) {
    if (G800_IFACES.has(port.interfaceCode)) refs.add('ieee/802.3df')
    else if (ETHERNET_IFACES.has(port.interfaceCode)) refs.add('ieee/802.3')
    if (port.poeStandard === '802.3af' || port.poeStandard === '802.3at' || port.poeStandard === '802.3bt') {
      refs.add(`ieee/${port.poeStandard}`)
    }
    if (port.interfaceCode === 'gpon') refs.add('itu-t/G.984')
  }
  return refs
}

/** Persiste una referencia de estándar como assertion + relationship. */
function persistirRef(dao: CatalogDao, deviceId: number, ref: string): { assertionCount: number; relationshipCount: number } {
  const assertionId = dao.addAssertion({
    subjectType: 'device',
    subjectId: deviceId,
    predicate: 'implements-standard',
    valueJson: JSON.stringify(ref),
    sourceSlug: 'netatlas-assist',
    confidence: 'derived',
    verifiedOn: '2025-02-10',
    author: 'curator-seed',
    reviewedBy: 'reviewer-seed',
  })
  dao.addRelationship({
    subjectType: 'device',
    subjectId: deviceId,
    predicate: 'implements-standard',
    objectType: 'standard',
    objectId: dao.standardId(ref),
    assertionId,
  })
  return { assertionCount: 1, relationshipCount: 1 }
}

/**
 * Mapea protocolos e interfaces a implements-standard curado (confidence=derived).
 *
 * Devuelve los conteos de assertions y relaciones creadas.
 */
export function seedProtocolStandards(dao: CatalogDao, seed: Seed): ConteosSiembra {
  let assertionCount = 0
  let relationshipCount = 0
  for (const dev of seed.devices) {
    const refs = recolectarRefs(dev)
    if (refs.size === 0) continue
    const deviceId = dao.deviceId(dev.slug)
    if (deviceId === undefined) continue
    // Omite estándares ya curados explícitamente en el seed.
    const curados = new Set(dao.existingStandardRefs(deviceId))
    for (const ref of [...refs].sort()) {
      if (curados.has(ref)) continue
      const c = persistirRef(dao, deviceId, ref)
      assertionCount += c.assertionCount
      relationshipCount += c.relationshipCount
    }
  }
  return { assertionCount, relationshipCount }
}
