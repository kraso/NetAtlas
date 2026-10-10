import type { SqliteDriver, SqlRow } from '../driver.js'
import { subtreeSql } from './attributes-contratos.js'
import type { AttributeDefinitionRow, DeviceAttributeRow, FacetCount } from './attributes-contratos.js'
import { agruparPorDispositivo, cumpleFacetas, filaADefinicion, filaAFaceta, filaAValor } from './attributes-filas.js'

/**
 * Repositorio de atributos por categoría (EAV acotado, §9.4).
 * Conecta attribute_definition/device_attribute con el explorador (facetas
 * dinámicas) y la ficha (valores). Los puertos son async para que el adaptador
 * wa-sqlite (navegador, F1-late) pueda sustituir a node:sqlite sin tocar vistas
 * ni viewmodels. El mapeo de filas vive en `attributes-filas.ts`.
 */

export type { AttributeDefinitionRow, DeviceAttributeRow, FacetCount }

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
    return rows.map(filaADefinicion)
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
    return rows.map(filaAValor)
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
    return rows.map(filaAFaceta).filter((f): f is FacetCount => f !== undefined)
  }

  /**
   * Slugs de dispositivos de una categoría (subárbol) que cumplen TODOS los
   * grupos de faceta dados (AND entre claves, OR dentro de una clave).
   */
  async filterByFacetValues(
    categoryCode: string,
    facets: Readonly<Record<string, readonly string[]>>,
  ): Promise<string[]> {
    const rows = this.db.prepare(consultaValoresDeSubarbol()).all(categoryCode) as SqlRow[]
    const keys = Object.keys(facets).filter((k) => (facets[k]?.length ?? 0) > 0)
    const porDispositivo = agruparPorDispositivo(rows)
    return [...porDispositivo.entries()]
      .filter(([, grupo]) => cumpleFacetas(grupo, keys, facets))
      .map(([slug]) => slug)
      .sort()
  }
}

/** Valores facetables de todos los dispositivos del subárbol de una categoría. */
function consultaValoresDeSubarbol(): string {
  return `SELECT d.slug AS slug, ad.key AS k, ad.value_type AS vt,
             COALESCE(CASE WHEN ad.value_type IN ('number','range') THEN CAST(da.value_number AS TEXT)
                           ELSE da.value_text END, '') AS val
      FROM device_attribute da
      JOIN attribute_definition ad ON ad.id = da.attribute_id
      JOIN device d ON d.id = da.device_id
      JOIN category c ON c.id = d.category_id
      WHERE c.id IN ${subtreeSql()}`
}
