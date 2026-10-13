import { Category, Manufacturer } from '@netatlas/domain'
import type {
  UiAttributeDefinition,
  InMemoryAttributeDefinition,
  InMemoryDeviceAttributeValue,
} from './in-memory-tipos.js'


// ── Catálogos del dataset de demostración (deterministas para tests/UI) ──────

export function demoManufacturers(): Manufacturer[] {
  return [
    Manufacturer.create({ slug: 'cisco', name: 'Cisco Systems', country: 'EE. UU.', snmpEnterprise: 9 }),
    Manufacturer.create({ slug: 'aruba', name: 'Aruba Networks', country: 'EE. UU.', snmpEnterprise: 14823 }),
    Manufacturer.create({ slug: 'mikrotik', name: 'MikroTik', country: 'Letonia', snmpEnterprise: 14988 }),
    Manufacturer.create({ slug: 'fortinet', name: 'Fortinet', country: 'EE. UU.', snmpEnterprise: 12356 }),
  ]
}

export function demoCategories(): Category[] {
  return [
    Category.create({ code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['sw'], sortOrder: 1 }),
    Category.create({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'Switches capa 2', aliases: [], sortOrder: 11 }),
    Category.create({ code: 'CAT-SWT-L3', parentCode: 'CAT-SWT', nameEs: 'Switches multilayer', aliases: [], sortOrder: 12 }),
    Category.create({ code: 'CAT-RTR', nameEs: 'Routing', aliases: ['rtr'], sortOrder: 2 }),
    Category.create({ code: 'CAT-SEC', nameEs: 'Seguridad', aliases: ['fw'], sortOrder: 3 }),
    Category.create({ code: 'CAT-WLS', nameEs: 'Inalámbricos', aliases: ['wifi'], sortOrder: 4 }),
  ]
}

/** Catálogos cerrados mínimos para los exploradores (NET-HW-023). */
export function demoProtocols(): readonly { code: string; name: string; family: string; osiLayer: number }[] {
  return [
    { code: 'ospf', name: 'OSPF', family: 'routing', osiLayer: 3 },
    { code: 'bgp', name: 'BGP', family: 'routing', osiLayer: 3 },
    { code: 'vxlan', name: 'VXLAN', family: 'overlay', osiLayer: 2 },
    { code: 'mpls', name: 'MPLS', family: 'routing', osiLayer: 3 },
    { code: 'ipsec', name: 'IPsec', family: 'security', osiLayer: 3 },
    { code: '802.11ax', name: '802.11ax (Wi-Fi 6)', family: 'wifi', osiLayer: 1 },
  ]
}

export function demoStandards(): readonly { org: string; identifier: string; title: string }[] {
  return [
    { org: 'ieee', identifier: '802.3at', title: 'Power over Ethernet Plus' },
    { org: 'ieee', identifier: '802.3an', title: '10GBASE-T' },
  ]
}

export function demoMedia(): readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[] {
  return [
    { code: 'smf-os2', kind: 'fibra', name: 'Monomodo OS2', maxSpeedMbps: 400000 },
    { code: 'utp-cat6a', kind: 'cobre', name: 'UTP Cat6A', maxSpeedMbps: 10000 },
    { code: 'mmf-om3', kind: 'fibra', name: 'Multimodo OM3', maxSpeedMbps: 10000 },
  ]
}


// ── EAV demo (F3): definiciones de atributo y valores por dispositivo ────────

function atributo(
  categoryCode: string,
  key: string,
  labelEs: string,
  valueType: UiAttributeDefinition['valueType'],
  isFacet: boolean,
  compareRule: UiAttributeDefinition['compareRule'],
  unit?: string,
  enumValues?: readonly string[],
): InMemoryAttributeDefinition {
  return { categoryCode, key, labelEs, valueType, isFacet, isComparable: true, compareRule, unit, enumValues }
}

function valor(deviceSlug: string, key: string, display: string): InMemoryDeviceAttributeValue {
  return { deviceSlug, key, display }
}

export function demoAttributeDefinitions(): readonly InMemoryAttributeDefinition[] {
  return [
    atributo('CAT-SWT-L3', 'switching_capacity_gbps', 'Capacidad de conmutación', 'number', true, 'higher-better', 'Gbps'),
    atributo('CAT-SWT-L2', 'poe_budget_w', 'Presupuesto PoE', 'number', true, 'higher-better', 'W'),
    atributo('CAT-SWT-L2', 'stackable', 'Apilable', 'enum', true, 'set-compare', undefined, ['sí', 'no']),
    atributo('CAT-RTR', 'routing_throughput_mbps', 'Rendimiento de ruteo', 'number', true, 'higher-better', 'Mbps'),
    atributo('CAT-SEC', 'firewall_throughput_gbps', 'Rendimiento de firewall', 'number', true, 'higher-better', 'Gbps'),
    atributo('CAT-WLS', 'wifi_max_rate_mbps', 'Tasa máxima Wi-Fi', 'number', true, 'higher-better', 'Mbps'),
  ]
}

export function demoDeviceAttributeValues(): readonly InMemoryDeviceAttributeValue[] {
  return [
    valor('cisco-c9300-48p', 'switching_capacity_gbps', '256'),
    valor('aruba-6300m-48g', 'switching_capacity_gbps', '176'),
    valor('aruba-2930f-48g', 'poe_budget_w', '370'),
    valor('aruba-2930f-48g', 'stackable', 'sí'),
    valor('mikrotik-ccr1036', 'routing_throughput_mbps', '10000'),
    valor('fortinet-200f', 'firewall_throughput_gbps', '18'),
    valor('cisco-9120axi', 'wifi_max_rate_mbps', '2400'),
  ]
}
