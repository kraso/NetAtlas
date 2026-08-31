/**
 * Conversores de unidades (NET-HW-028).
 * Velocidades de datos, potencias ópticas, bytes/decimales, distancias.
 * Servicios puros del dominio.
 */

export type UnidadVelocidad = 'bps' | 'kbps' | 'Mbps' | 'Gbps' | 'Tbps'

const MULT_VELOCIDAD: Record<UnidadVelocidad, number> = {
  bps: 1,
  kbps: 1e3,
  Mbps: 1e6,
  Gbps: 1e9,
  Tbps: 1e12,
}

/** Convierte velocidad entre unidades (base: bits por segundo). */
export function convierteVelocidad(valor: number, de: UnidadVelocidad, a: UnidadVelocidad): number {
  if (!Number.isFinite(valor) || valor < 0) throw new Error(`Valor de velocidad inválido: ${valor}.`)
  const bps = valor * MULT_VELOCIDAD[de]
  return bps / MULT_VELOCIDAD[a]
}

/** Formatea una velocidad en la unidad más legible (p. ej. 10000 Mbps → "10 Gbps"). */
export function formatoVelocidadHumano(bps: number): string {
  if (bps >= 1e12) return `${(bps / 1e12).toFixed(2)} Tbps`
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(0)} Mbps`
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} kbps`
  return `${bps} bps`
}

export type UnidadDatos = 'bit' | 'byte' | 'kB' | 'MB' | 'GB' | 'TB'

const MULT_DATOS: Record<UnidadDatos, number> = {
  bit: 1,
  byte: 8,
  kB: 8e3,
  MB: 8e6,
  GB: 8e9,
  TB: 8e12,
}

/** Convierte cantidades de datos (base: bits; decimal, como en redes). */
export function convierteDatos(valor: number, de: UnidadDatos, a: UnidadDatos): number {
  const bits = valor * MULT_DATOS[de]
  return bits / MULT_DATOS[a]
}

/** Potencias ópticas dBm ↔ mW. */
export function dbmToMw(dbm: number): number {
  return Math.pow(10, dbm / 10)
}

export function mwToDbm(mw: number): number {
  if (mw <= 0) throw new Error('La potencia en mW debe ser > 0.')
  return 10 * Math.log10(mw)
}

/** dB lineales: ratio → dB y dB → ratio. */
export function ratioToDb(ratio: number): number {
  if (ratio <= 0) throw new Error('El ratio debe ser > 0.')
  return 10 * Math.log10(ratio)
}

export function dbToRatio(db: number): number {
  return Math.pow(10, db / 10)
}

export type UnidadDistancia = 'm' | 'km' | 'mi'

const METROS: Record<UnidadDistancia, number> = { m: 1, km: 1000, mi: 1609.344 }

export function convierteDistancia(valor: number, de: UnidadDistancia, a: UnidadDistancia): number {
  return (valor * METROS[de]) / METROS[a]
}