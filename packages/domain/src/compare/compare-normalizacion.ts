import type { CompareDeviceValue } from './compare-contratos.js'

/**
 * Normalización de valores para el comparador (§18.2): número canónico por
 * celda y detección de filas sin diferencias. Puro, sin entrada del motor.
 */

/** Valor numérico canónico de una celda (si el atributo es numérico/rango). */
export function valorNumerico(v: CompareDeviceValue): number | undefined {
  if (v.def.valueType !== 'number' && v.def.valueType !== 'range') return undefined
  if (v.valueNumber !== undefined) return v.valueNumber
  const parsed = Number(String(v.display).replace(/[^\d.\-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/** ¿Todos los valores presentes de la fila son iguales? (numérico o texto). */
export function valoresIguales(celda: readonly CompareDeviceValue[]): boolean {
  const tipo = celda[0]?.def.valueType
  if (tipo === 'number' || tipo === 'range') {
    const nums = celda.map(valorNumerico)
    return nums.every((n) => n === nums[0])
  }
  const displays = celda.map((c) => c.display)
  return displays.every((d) => d === displays[0])
}
