import type { SqliteDriver, SqlRow, SqlValue } from '../driver.js'

/**
 * Repositorio de atributos por categoría (EAV acotado, §9.4).
 * Conecta attribute_definition/device_attribute con el explorador (facetas
 * dinámicas) y la ficha (valores). Atributos y facetas son datos, no código.
 * Los puertos son async para que el adaptador wa-sqlite (navegador, F1-late)
 * pueda sustituir a node:sqlite sin tocar vistas ni viewmodels.
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
function subtreeSql(): string {
  return `(
    WITH RECURSIVE sub(cat_id) AS (
      SELECT id FROM category WHERE code = ?
      UNION ALL
      SELECT c2.id FROM category c2 JOIN sub s ON c2.parent_id = s.cat_id
    )
    SELECT cat_id FROM sub
  )`
}

/** Cadena legible de un valor EAV (misma regla que la proyección SQL). */
function displayValue(type: string, num: SqlValue | null | undefined, txt: SqlValue | null | undefined, bool: SqlValue | null | undefined): string {
  if (type === 'number' || type === 'range') {
    return num !== null ? String(Number(num)) : '—'
  }
  if (bool !== null && bool !== undefined) return Number(bool) === 1 ? 'sí' : 'no'
  if (txt !== null && txt !== undefined) return String(txt)
  return '—'
}

export class SqliteAttributesRepository {
  constructor(private readonly db: SqliteDriver) {}

  /** Definiciones de atributos de una categoría (incluye heredadas del padre). */
  async attributeDefinitionsByCategory(categoryCode: string): Promise<AttributeDefinitionRow[]> {
    const rows = this.db
      .prepare(
        `SELECT ad.key, ad.label_es, ad.value_type, ad.unit, ad.enum_json,
                ad.is_facet, ad.is_comparable, ad.compare_rule
         FROM attribute_definition ad
         JOIN category c ON c.id = ad.category_id
         WHERE c.id IN (
           WITH RECURSIVE anc(cat_id) AS (
             SELECT id FROM category WHERE code = ?
             UNION ALL
             SELECT c2.parent_id FROM category c2 JOIN anc a ON c2.id = a.cat_id
           )
           SELECT cat_id FROM anc WHERE cat_id IS NOT NULL
         )
         ORDER BY ad.sort_order, ad.key`,
      )
      .all(categoryCode) as SqlRow[]

    return rows.map((r) => ({
      key: String(r.key),
      labelEs: String(r.label_es),
      valueType: String(r.value_type) as AttributeDefinitionRow['valueType'],
      unit: r.unit !== null ? String(r.unit) : undefined,
      enumValues: r.enum_json ? (JSON.parse(String(r.enum_json)) as string[]) : undefined,
      isFacet: Number(r.is_facet) === 1,
      isComparable: Number(r.is_comparable) === 1,
      compareRule: String(r.compare_rule) as AttributeDefinitionRow['compareRule'],
    }))
  }

  /** Valores de atributos de un dispositivo (para la pestaña Capacidades). */
  async attributeValuesForDevice(deviceSlug: string): Promise<DeviceAttributeRow[]> {
    const rows = this.db
      .prepare(
        `SELECT ad.key, ad.label_es, ad.value_type, ad.unit,
                da.value_number, da.value_text, da.value_bool
         FROM device_attribute da
         JOIN attribute_definition ad ON ad.id = da.attribute_id
         JOIN device d ON d.id = da.device_id
         WHERE d.slug = ?
         ORDER BY ad.sort_order, ad.key`,
      )
      .all(deviceSlug) as SqlRow[]

    return rows.map((r) => {
      const type = String(r.value_type) as DeviceAttributeRow['valueType']
      const num = r.value_number !== null ? Number(r.value_number) : undefined
      const txt = r.value_text !== null ? String(r.value_text) : undefined
      const bool = r.value_bool !== null ? Number(r.value_bool) === 1 : undefined
      return {
        key: String(r.key),
        labelEs: String(r.label_es),
        valueType: type,
        unit: r.unit !== null ? String(r.unit) : undefined,
        valueNumber: num,
        valueText: txt,
        valueBool: bool,
        display: displayValue(type, r.value_number, r.value_text, r.value_bool),
      }
    })
  }

  /** Facetas dinámicas: conteo de valores facetables en dispositivos de una categoría (subárbol). */
  async facetCounts(categoryCode: string, attributeKey: string): Promise<FacetCount[]> {
    const rows = this.db
      .prepare(
        `SELECT COALESCE(
           CASE WHEN ad.value_type IN ('number','range') THEN CAST(da.value_number AS TEXT)
                ELSE da.value_text END, '') AS val,
           ad.value_type AS vt,
           COUNT(*) AS cnt
         FROM device_attribute da
         JOIN attribute_definition ad ON ad.id = da.attribute_id AND ad.is_facet = 1
         JOIN device d ON d.id = da.device_id
         JOIN category c ON c.id = d.category_id
         WHERE ad.key = ?
           AND c.id IN ${subtreeSql()}
         GROUP BY val
         ORDER BY cnt DESC`,
      )
      .all(attributeKey, categoryCode) as SqlRow[]

    return rows
      .filter((r) => String(r.val).length > 0)
      .map((r) => {
        // SQLite castea REAL como '176.0'; la faceta muestra '176'.
        const raw = String(r.val)
        const isNumeric = String(r.vt) === 'number' || String(r.vt) === 'range'
        const value = isNumeric ? String(Number(raw)) : raw
        return { value, count: Number(r.cnt) }
      })
  }

  /**
   * Slugs de dispositivos de una categoría (subárbol) que cumplen TODOS los
   * grupos de faceta dados (AND entre claves, OR dentro de una clave).
   */
  async filterByFacetValues(
    categoryCode: string,
    facets: Readonly<Record<string, readonly string[]>>,
  ): Promise<string[]> {
    const keys = Object.keys(facets).filter((k) => (facets[k]?.length ?? 0) > 0)
    const sql = `
      SELECT d.slug AS slug, ad.key AS k, ad.value_type AS vt,
             COALESCE(CASE WHEN ad.value_type IN ('number','range') THEN CAST(da.value_number AS TEXT)
                           ELSE da.value_text END, '') AS val
      FROM device_attribute da
      JOIN attribute_definition ad ON ad.id = da.attribute_id
      JOIN device d ON d.id = da.device_id
      JOIN category c ON c.id = d.category_id
      WHERE c.id IN ${subtreeSql()}
    `
    const rows = this.db.prepare(sql).all(categoryCode) as SqlRow[]

    const porDispositivo = new Map<string, Map<string, Set<string>>>()
    for (const r of rows) {
      const slug = String(r.slug)
      const key = String(r.k)
      const raw = String(r.val)
      const isNumeric = String(r.vt) === 'number' || String(r.vt) === 'range'
      const value = isNumeric ? String(Number(raw)) : raw
      if (!value || value === '—') continue
      let grupo = porDispositivo.get(slug)
      if (!grupo) {
        grupo = new Map()
        porDispositivo.set(slug, grupo)
      }
      let vals = grupo.get(key)
      if (!vals) {
        vals = new Set()
        grupo.set(key, vals)
      }
      vals.add(value)
    }

    const cumple = (grupo: Map<string, Set<string>>): boolean =>
      keys.every((k) => {
        const candidatos = grupo.get(k)
        if (!candidatos || candidatos.size === 0) return false
        return [...candidatos].some((v) => facets[k]!.includes(v))
      })

    const slugs = [...porDispositivo.entries()]
      .filter(([, grupo]) => cumple(grupo))
      .map(([slug]) => slug)
    slugs.sort()
    return slugs
  }
}

export type { SqlValue }