/**
 * Calculadora de subnetting (NET-HW-028) — VLSM/CIDR en IPv4.
 * Servicio puro: sin dependencias de red del host.
 */

export interface RedInfo {
  readonly redBase: string
  readonly prefijo: number
  /** Primer host utilizable. */
  readonly primerHost: string
  readonly ultimoHost: string
  readonly broadcast: string
  readonly hostsUtilizables: number
  readonly mascara: string
}

function ipv4ToInt(ip: string): number {
  const partes = ip.split('.').map(Number)
  if (partes.length !== 4 || partes.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`IPv4 inválida: "${ip}".`)
  }
  return partes.reduce((acc, p) => (acc << 8) | p, 0) >>> 0
}

function intToIpv4(v: number): string {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff].join('.')
}

/** Mascara CIDR → entero de 32 bits. */
function cidrMask(prefijo: number): number {
  if (prefijo < 0 || prefijo > 32) throw new Error(`Prefijo CIDR inválido: /${prefijo}.`)
  return prefijo === 0 ? 0 : (0xffffffff << (32 - prefijo)) >>> 0
}

/** Calcula la red (dirección base), broadcast y rango de hosts. */
export function calculaSubred(ipConPrefijo: string): RedInfo {
  const [ipRaw, prefRaw] = ipConPrefijo.split('/')
  if (prefRaw === undefined) throw new Error('Formato esperado: "192.168.1.1/24".')
  const prefijo = Number(prefRaw)
  const ip = ipv4ToInt(ipRaw!)
  const mask = cidrMask(prefijo)
  const redBase = intToIpv4((ip & mask) >>> 0)
  const broadcast = intToIpv4(((ip & mask) | ~mask) >>> 0)
  const primerHost = intToIpv4(((ip & mask) + (prefijo < 31 ? 1 : 0)) >>> 0)
  const ultimoHost = intToIpv4((((ip & mask) | ~mask) - (prefijo < 31 ? 1 : 0)) >>> 0)
  const hosts = prefijo >= 31 ? (prefijo === 32 ? 1 : 2) : Math.pow(2, 32 - prefijo) - 2

  return {
    redBase,
    prefijo,
    primerHost,
    ultimoHost,
    broadcast,
    hostsUtilizables: hosts,
    mascara: intToIpv4(mask),
  }
}

/**
 * VLSM: divisible una red base en subredes de tamaños decrecientes (greedy).
 * Devuelve una subred por cada tamaño solicitado, en orden.
 * Nota: el tamaño se interpreta como hosts utilizables de la subred.
 */
export function vlsm(redBaseConPrefijo: string, sizesHosts: readonly number[]): RedInfo[] {
  const [r, p] = redBaseConPrefijo.split('/')
  const redBase = r!
  const prefijoBase = Number(p)

  let cursor = ipv4ToInt(redBase)
  const out: RedInfo[] = []
  for (const size of sizesHosts) {
    if (size < 0) throw new Error('Tamaño de subred negativo.')
    // hosts utilizables h ⇒ bits de host = ceil(log2(h+2)); mínimo 2 bits (/30).
    const bitsHost = Math.max(2, Math.ceil(Math.log2(size + 2)))
    const prefNuevo = Math.max(prefijoBase, 32 - bitsHost)
    const red = calculaSubred(`${intToIpv4(cursor)}/${prefNuevo}`)
    out.push(red)
    const bloque = Math.pow(2, 32 - prefNuevo)
    cursor = (cursor + bloque) >>> 0
  }
  return out
}