import { Device, OsiProfileValue, Port } from '@netatlas/domain'

// ── Dispositivos del dataset de demostración ────────────────────────────────

/** Dispositivo de demostración genérico: 48x 1G PoE+ + 4 uplinks SFP+. */
function dev(slug: string, name: string, mfr: string, cat: string, osi: [number[], number[], number]): Device {
  return Device.create({
    slug,
    name,
    manufacturerSlug: mfr,
    categoryCode: cat,
    lifecycleStatus: 'current',
    osiProfile: OsiProfileValue.create({ terminate: osi[0], transparent: osi[1], primary: osi[2] }),
    summary: `Dispositivo de demostración: ${name}.`,
    releasedOn: '2020-01-01',
    ports: [
      Port.create({ label: '48x 10/100/1000', interfaceCode: 'rj45', quantity: 48, speedsMbps: [1000], poeStandard: '802.3at', role: 'access' }),
      Port.create({ label: '4x SFP+', interfaceCode: 'sfp-plus', quantity: 4, speedsMbps: [10000], role: 'uplink' }),
    ],
  })
}

/**
 * El 9300 de demostración NO ofrece PoE en los puertos (8.2.5): permite que el
 * comparador (CU-02/F5) muestre diferencias reales frente a 6300M/2930F.
 */
function devC9300(): Device {
  return Device.create({
    slug: 'cisco-c9300-48p',
    name: 'Cisco Catalyst 9300-48P',
    manufacturerSlug: 'cisco',
    categoryCode: 'CAT-SWT-L3',
    lifecycleStatus: 'current',
    osiProfile: OsiProfileValue.create({ terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 }),
    summary: 'Dispositivo de demostración: Cisco Catalyst 9300-48P.',
    releasedOn: '2020-01-01',
    ports: [
      Port.create({ label: '48x 10/100/1000', interfaceCode: 'rj45', quantity: 48, speedsMbps: [1000], role: 'access' }),
      Port.create({ label: '4x SFP+', interfaceCode: 'sfp-plus', quantity: 4, speedsMbps: [10000], role: 'uplink' }),
    ],
  })
}

export function demoDevices(): Device[] {
  return [
    devC9300(),
    dev('aruba-6300m-48g', 'Aruba 6300M 48G', 'aruba', 'CAT-SWT-L3', [[1, 2, 3], [4, 5, 6, 7], 2]),
    dev('aruba-2930f-48g', 'Aruba 2930F 48G PoE+', 'aruba', 'CAT-SWT-L2', [[1, 2], [3, 4, 5, 6, 7], 2]),
    dev('mikrotik-ccr1036', 'MikroTik CCR1036-8G-2S+', 'mikrotik', 'CAT-RTR', [[1, 2, 3, 4], [5, 6, 7], 3]),
    dev('fortinet-200f', 'FortiGate 200F', 'fortinet', 'CAT-SEC', [[1, 2, 3, 4, 5, 6, 7], [], 4]),
    dev('cisco-9120axi', 'Cisco Catalyst 9120AXI', 'cisco', 'CAT-WLS', [[1, 2], [3, 4, 5, 6, 7], 2]),
  ]
}
