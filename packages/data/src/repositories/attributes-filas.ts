import type { SqlRow } from '../driver.js'
import { comoBooleano, comoNumero, comoTexto, displayValue, valorFaceta } from './attributes-contratos.js'
import type { AttributeDefinitionRow, DeviceAttributeRow, FacetCount } from './attributes-contratos.js'

/**
 * Mapeo de filas SQL del EAV (§9.4) a contratos del dominio y agrupación de
 * valores por dispositivo para el filtrado de facetas.
 */

export function filaADefinicion(r: SqlRow): AttributeDefinitionRow {
  return {
    key: String(r.key),
    labelEs: String(r.label_es),
    valueType: String(r.value_type) as AttributeDefinitionRow['valueType'],
    unit: comoTexto(r.unit),
    enumValues: parsearEnumJson(comoTexto(r.enum_json)),
    isFacet: Number(r.is_facet) === 1,
    isComparable: Number(r.is_comparable) === 1,
    compareRule: String(r.compare_rule) as AttributeDefinitionRow['compareRule'],
  }
}

/** enum_json ilegible o con forma inesperada → se ignora con registro (nunca throw). */
function parsearEnumJson(json: string | undefined): string[] | undefined {
  if (json === undefined) return undefined
  try {
    const parseado: unknown = JSON.parse(json)
    if (!Array.isArray(parseado) || parseado.some((v) => typeof v !== 'string')) {
      console.warn('[WARN] enum_json con forma inesperada; se ignora', { json })
      return undefined
    }
    return parseado as string[]
  } catch (error) {
    console.warn('[WARN] enum_json ilegible; se ignora', { json, error })
    return undefined
  }
}

export function filaAValor(r: SqlRow): DeviceAttributeRow {
  const type = String(r.value_type) as DeviceAttributeRow['valueType']
  return {
    key: String(r.key),
    labelEs: String(r.label_es),
    valueType: type,
    unit: comoTexto(r.unit),
    valueNumber: comoNumero(r.value_number),
    valueText: comoTexto(r.value_text),
    valueBool: comoBooleano(r.value_bool),
    display: displayValue(type, r.value_number, r.value_text, r.value_bool),
  }
}

/** Conteo de faceta; las filas con valor vacío o conteo inválido se descartan. */
export function filaAFaceta(r: SqlRow): FacetCount | undefined {
  const raw = String(r.val)
  if (raw.length === 0) return undefined
  const count = comoNumero(r.cnt)
  if (count === undefined) {
    console.warn('[WARN] conteo de faceta inválido; se descarta la fila', { valor: raw, cnt: r.cnt })
    return undefined
  }
  return { value: valorFaceta(String(r.vt), raw), count }
}

/** Valores facetables por dispositivo: slug → clave → conjunto de valores. */
export function agruparPorDispositivo(rows: readonly SqlRow[]): Map<string, Map<string, Set<string>>> {
  const porDispositivo = new Map<string, Map<string, Set<string>>>()
  for (const r of rows) {
    const value = valorFaceta(String(r.vt), String(r.val))
    if (!value || value === '—') continue
    const grupo = porDispositivo.get(String(r.slug)) ?? new Map<string, Set<string>>()
    porDispositivo.set(String(r.slug), grupo)
    const vals = grupo.get(String(r.k)) ?? new Set<string>()
    grupo.set(String(r.k), vals)
    vals.add(value)
  }
  return porDispositivo
}

/** AND entre claves de faceta, OR dentro de una misma clave. */
export function cumpleFacetas(
  grupo: ReadonlyMap<string, ReadonlySet<string>>,
  keys: readonly string[],
  facets: Readonly<Record<string, readonly string[]>>,
): boolean {
  return keys.every((k) => {
    const candidatos = grupo.get(k)
    if (!candidatos || candidatos.size === 0) return false
    return [...candidatos].some((v) => facets[k]?.includes(v) ?? false)
  })
}
