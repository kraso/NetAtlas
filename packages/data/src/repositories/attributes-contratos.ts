import type { SqlValue } from '../driver.js'

/**
 * Contratos del repositorio de atributos (EAV acotado, §9.4): filas de
 * definiciones/valores y facetas. Atributos y facetas son datos, no código.
 */

export interface AttributeDefinitionRow {
  readonly key: string
  readonly labelEs: string
  readonly valueType: 'number' | 'text' | 'enum' | 'bool' | 'range'
  readonly unit?: string
  readonly enumValues?: readonly string[]
  readonly isFacet: boolean
  readonly isComparable: boolean
  readonly compareRule: 'higher-better' | 'lower-better' | 'set-compare' | 'none'
}

export interface DeviceAttributeRow {
  readonly key: string
  readonly labelEs: string
  readonly valueType: AttributeDefinitionRow['valueType']
  readonly unit?: string
  readonly valueNumber?: number
  readonly valueText?: string
  readonly valueBool?: boolean
  /** Label del valor enum/texto para la UI. */
  readonly display: string
}

export interface FacetCount {
  readonly value: string
  readonly count: number
}

/** Subárbol de categorías: {código dado} ∪ descendientes. */
export function subtreeSql(): string {
  return `(
    WITH RECURSIVE sub(cat_id) AS (
      SELECT id FROM category WHERE code = ?
      UNION ALL
      SELECT c2.id FROM category c2 JOIN sub s ON c2.parent_id = s.cat_id
    ) SELECT cat_id FROM sub)`
}

/** Cadena legible de un valor EAV (misma regla que la proyección SQL). */
export function displayValue(
  type: string,
  num: SqlValue | null | undefined,
  txt: SqlValue | null | undefined,
  bool: SqlValue | null | undefined,
): string {
  if (type === 'number' || type === 'range') {
    const n = comoNumero(num)
    return n === undefined ? '—' : String(n)
  }
  const booleano = comoBooleano(bool)
  if (booleano !== undefined) return booleano ? 'sí' : 'no'
  return comoTexto(txt) ?? '—'
}

/** Valor SQL presente → número finito; ausente o inválido → undefined (registrado). */
export function comoNumero(valor: SqlValue | null | undefined): number | undefined {
  if (valor === null || valor === undefined) return undefined
  const n = Number(valor)
  if (!Number.isFinite(n)) {
    // Dato inválido del EAV: se registra y se trata como ausente (nunca "NaN" en UI).
    console.warn('[WARN] valor numérico inválido en atributos; se trata como ausente', { valor })
    return undefined
  }
  return n
}

/** Valor SQL presente → texto; null/undefined (columna ausente) → undefined. */
export function comoTexto(valor: SqlValue | null | undefined): string | undefined {
  return valor === null || valor === undefined ? undefined : String(valor)
}

/** Valor SQL 0/1 → booleano; ausente o fuera de {0,1} → undefined (registrado). */
export function comoBooleano(valor: SqlValue | null | undefined): boolean | undefined {
  if (valor === null || valor === undefined) return undefined
  const n = Number(valor)
  if (n === 1) return true
  if (n === 0) return false
  console.warn('[WARN] valor booleano inválido en atributos; se trata como ausente', { valor })
  return undefined
}

/** Valor de faceta normalizado (SQLite castea REAL '176.0' → '176'). */
export function valorFaceta(valueType: string, raw: string): string {
  const esNumerico = valueType === 'number' || valueType === 'range'
  return esNumerico ? String(Number(raw)) : raw
}
