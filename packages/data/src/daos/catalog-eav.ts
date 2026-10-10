import type { SqliteDriver } from '../driver.js'
import { categoryId } from './catalog-maestros.js'
import { deviceId } from './catalog-dispositivos.js'
import type { AttributeDefRow } from './catalog-tipos.js'

/**
 * EAV: attribute_definition / device_attribute (§9.4). Funciones libres sobre
 * el driver que `CatalogDao` delega sin cambiar su API.
 */

/** Define un atributo de categoría (idempotente por (category, key)). */
export function defineAttribute(db: SqliteDriver, def: AttributeDefRow): number {
  const catId = categoryId(db, def.categoryCode)
  if (catId === undefined) throw new Error(`defineAttribute: categoría "${def.categoryCode}" inexistente.`)
  const existing = db.prepare('SELECT id FROM attribute_definition WHERE category_id = ? AND key = ?').get(catId, def.key)
  if (existing) return Number(existing.id)
  const res = db
    .prepare(
      `INSERT INTO attribute_definition
         (category_id, key, label_es, value_type, unit, enum_json, is_facet, is_comparable, compare_rule, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(catId, def.key, def.labelEs, def.valueType, def.unit ?? null, def.enumValues ? JSON.stringify(def.enumValues) : null, def.isFacet ? 1 : 0, def.isComparable ?? true ? 1 : 0, def.compareRule ?? 'none')
  return Number(res.lastInsertRowid)
}

/** Atributo aplicable al dispositivo: el suyo o el heredado de su categoría. */
const SQL_ATRIBUTO_DE_DEVICE = `SELECT ad.id, ad.value_type FROM attribute_definition ad
       JOIN category c ON c.id = ad.category_id
       JOIN device d ON d.id = ? AND (c.id = d.category_id OR c.id IN (
         WITH RECURSIVE anc(cat_id) AS (
           SELECT d.category_id
           UNION ALL
           SELECT c2.parent_id FROM category c2 JOIN anc a ON c2.id = a.cat_id
         )
         SELECT cat_id FROM anc WHERE cat_id IS NOT NULL
       ))
       WHERE ad.key = ?`

/** Definición del atributo, o error si el dispositivo no admite esa clave. */
function definirAtributo(
  db: SqliteDriver,
  deviceId: number,
  attributeKey: string,
  deviceSlug: string,
): { id: number; value_type: string } {
  const attr = db.prepare(SQL_ATRIBUTO_DE_DEVICE).get(deviceId, attributeKey) as
    | { id: number; value_type: string }
    | undefined
  if (!attr) {
    throw new Error(
      `setDeviceAttribute: atributo "${attributeKey}" no definido para la categoría del dispositivo "${deviceSlug}".`,
    )
  }
  return attr
}

/** Columnas numérica/texto/booleana del valor según el tipo del atributo. */
function columnasDeValor(
  valueType: string,
  value: number | string | boolean | null,
): { valueNumber: number | null; valueText: string | null; valueBool: number | null } {
  return {
    valueNumber: valueType === 'number' || valueType === 'range' ? (typeof value === 'number' ? value : null) : null,
    valueText: typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? '1' : '0') : null,
    valueBool: typeof value === 'boolean' ? (value ? 1 : 0) : valueType === 'bool' && typeof value === 'number' ? (value !== 0 ? 1 : 0) : null,
  }
}

/** Asigna (o reemplaza) el valor de un atributo a un dispositivo. */
export function setDeviceAttribute(
  db: SqliteDriver,
  deviceSlug: string,
  attributeKey: string,
  value: number | string | boolean | null,
  assertionId?: number,
): void {
  const id = deviceId(db, deviceSlug)
  if (id === undefined) throw new Error(`setDeviceAttribute: dispositivo "${deviceSlug}" inexistente.`)
  const attr = definirAtributo(db, id, attributeKey, deviceSlug)
  const { valueNumber, valueText, valueBool } = columnasDeValor(attr.value_type, value)

  db.prepare(
    `INSERT INTO device_attribute (device_id, attribute_id, value_number, value_text, value_bool, assertion_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id, attribute_id) DO UPDATE SET
       value_number = excluded.value_number,
       value_text = excluded.value_text,
       value_bool = excluded.value_bool,
       assertion_id = COALESCE(excluded.assertion_id, device_attribute.assertion_id)`,
  ).run(id, attr.id, valueNumber, valueText, valueBool, assertionId ?? null)
}
