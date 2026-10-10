/**
 * Catálogos por familia del generador asistido (NET-HW-007): protocolos,
 * inventario de puertos típico y perfil OSI heredable POR CATEGORÍA.
 *
 * Regla de integridad (PLAN MAESTRO §4.3 / §20): SOLO datos estructurales;
 * NUNCA se inventan especificaciones numéricas de rendimiento (throughput,
 * mpps, poe budget…): se omiten y quedan pendientes de datasheet en F2.
 */

/** Protocolos típicos POR FAMILIA (códigos del catálogo cerrado). */
export const PROTOCOLS_BY_FAMILY: Record<string, string[]> = {
  'CAT-SWT': ['802.1q', 'stp', 'rstp', 'lldp', 'lacp'],
  'CAT-SWT-L2': ['802.1q', 'rstp', 'lldp', 'lacp'],
  'CAT-SWT-L3': ['802.1q', 'rstp', 'lldp', 'lacp', 'ospf', 'bgp', 'vxlan'],
  'CAT-RTR': ['ospf', 'bgp', 'ipv6', 'nat', 'dhcp'],
  'CAT-RTR-ENT': ['ospf', 'bgp', 'ipv6', 'mpls', 'nat'],
  'CAT-WLS': ['802.11ax', 'wpa3', 'capwap'],
  'CAT-WLS-AP': ['802.11ax', 'wpa3'],
  'CAT-ACC': ['dhcp', 'nat', 'pppoe'],
  'CAT-ACC-CABLE': ['dhcp', 'docsis'],
  'CAT-ACC-ONT': ['gpon', 'ipv6', 'dhcp'],
  'CAT-SEC': ['ipsec', 'ssl-vpn', 'snmp'],
  'CAT-SEC-FW': ['ipsec', 'ssl-vpn'],
  'CAT-SEC-NGFW': ['ipsec', 'ssl-vpn', 'snmp'],
  'CAT-DCN': ['vxlan', 'bgp', 'roce', 'ospf'],
  'CAT-IND': ['profinet', 'modbus', 'ethernet-ip', 'tsn'],
  'CAT-IOT': ['mqtt', 'coap', 'ipv6'],
  'CAT-OPT': ['otn', 'dwdm', 'sonet-sdh'],
  'CAT-TEL': ['mpls', 'dwdm', 'sonet-sdh'],
}

/** Inventario de puertos típico POR FAMILIA (nunca rendimiento declarado). */
export const PORTS_BY_FAMILY: Record<string, { iface: string; qty: number; speeds: number[]; role?: string }[]> = {
  'CAT-SWT': [
    { iface: 'rj45', qty: 48, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-SWT-L2': [
    { iface: 'rj45', qty: 24, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 2, speeds: [1000], role: 'uplink' },
  ],
  'CAT-SWT-L3': [
    { iface: 'rj45', qty: 24, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-RTR': [
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 2, speeds: [1000], role: 'uplink' },
  ],
  'CAT-RTR-ENT': [
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-WLS-AP': [{ iface: 'rj45', qty: 1, speeds: [1000], role: 'uplink' }],
  'CAT-WLS': [{ iface: 'rj45', qty: 2, speeds: [1000], role: 'access' }],
  'CAT-ACC-ONT': [
    { iface: 'gpon', qty: 1, speeds: [1000], role: 'uplink' },
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
  ],
  'CAT-ACC-CABLE': [{ iface: 'rj45', qty: 1, speeds: [1000], role: 'access' }],
  'CAT-SEC-NGFW': [
    { iface: 'rj45', qty: 8, speeds: [1000], role: 'access' },
    { iface: 'sfp-plus', qty: 4, speeds: [10000], role: 'uplink' },
  ],
  'CAT-SEC-FW': [
    { iface: 'rj45', qty: 8, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 4, speeds: [1000], role: 'uplink' },
  ],
  'CAT-DCN': [
    { iface: 'sfp-plus', qty: 48, speeds: [10000], role: 'access' },
    { iface: 'qsfp-plus', qty: 4, speeds: [40000], role: 'uplink' },
  ],
  'CAT-IND': [
    { iface: 'rj45', qty: 8, speeds: [100], role: 'access' },
    { iface: 'fibra', qty: 2, speeds: [100], role: 'uplink' },
  ],
  'CAT-IOT': [{ iface: 'rj45', qty: 1, speeds: [100], role: 'access' }],
  'CAT-OPT': [{ iface: 'sfp-plus', qty: 2, speeds: [10000], role: 'uplink' }],
  'CAT-TEL': [
    { iface: 'rj45', qty: 4, speeds: [1000], role: 'access' },
    { iface: 'sfp', qty: 2, speeds: [1000], role: 'uplink' },
  ],
}

/** Perfil OSI heredable por macrocategoría. */
export const OSI_BY_FAMILY: Record<string, { terminate: number[]; transparent: number[]; primary: number }> = {
  'CAT-SWT': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-SWT-L2': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-SWT-L3': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-RTR': { terminate: [1, 2, 3, 4], transparent: [5, 6, 7], primary: 3 },
  'CAT-RTR-ENT': { terminate: [1, 2, 3, 4], transparent: [5, 6, 7], primary: 3 },
  'CAT-WLS': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-WLS-AP': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-ACC': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-ACC-CABLE': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-ACC-ONT': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-SEC': { terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 },
  'CAT-SEC-FW': { terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 },
  'CAT-SEC-NGFW': { terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 },
  'CAT-DCN': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-IND': { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 },
  'CAT-IOT': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
  'CAT-OPT': { terminate: [1], transparent: [2, 3, 4, 5, 6, 7], primary: 1 },
  'CAT-TEL': { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 2 },
}

/** Perfil OSI por defecto cuando la familia no está declarada. */
export const OSI_POR_DEFECTO = { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }
