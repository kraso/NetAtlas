import type { SqliteDriver } from '../driver.js'

/**
 * Helpers del adaptador SQLite del asistente IA (§21/F7): valores legibles,
 * validación de spec de topología y consultas pequeñas reutilizables.
 */

/** Rol de topología → categoría del catálogo (solo categorías existentes). */
export const ROL_A_CATEGORIA: Readonly<Record<string, string>> = {
  switch: 'CAT-SWT',
  router: 'CAT-RTR',
  ap: 'CAT-WLS',
  firewall: 'CAT-SEC',
  host: undefined as never,
  servidor: undefined as never,
}

export interface SqlRowValue {
  value_json: string
}

/** Valor legible de una assertion (number/text/bool). */
export function valorLegible(predicate: string, valueJson: string): string {
  try {
    const v = JSON.parse(valueJson) as unknown
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'sí' : 'no'
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null) {
      const obj = v as Record<string, unknown>
      if (predicate.endsWith('_w') && typeof obj.w === 'number') return String(obj.w)
    }
    return String(v)
  } catch (error) {
    // El valor persistido no es JSON válido: se devuelve tal cual, pero con rastro.
    console.warn(`[WARN] assertion ${predicate}: value_json no es JSON válido`, { valueJson, error })
    return valueJson
  }
}

export function validarSpecFromRaw(spec: Readonly<Record<string, unknown>>): { name: string; roles: { rol: string; cantidad: number }[] } | undefined {
  if (typeof spec.name !== 'string' || !Array.isArray(spec.roles)) return undefined
  const roles = spec.roles
    .map((r) => {
      if (typeof r !== 'object' || r === null) return undefined
      const rr = r as Record<string, unknown>
      if (typeof rr.rol !== 'string' || typeof rr.cantidad !== 'number' || !Number.isFinite(rr.cantidad)) return undefined
      // Tras normalizar la cantidad debe seguir siendo ≥ 1 (0,5 no es un rol).
      const cantidad = Math.floor(rr.cantidad)
      if (cantidad < 1) return undefined
      return { rol: rr.rol, cantidad }
    })
    .filter((x): x is { rol: string; cantidad: number } => x !== undefined)
  if (roles.length === 0) return undefined
  return { name: spec.name, roles }
}

/** Categoría de un dispositivo por slug (join directo, sin repositorio). */
export function deviceCategory(db: SqliteDriver, slug: string): string {
  const row = db.prepare('SELECT c.code AS code FROM device d JOIN category c ON c.id = d.category_id WHERE d.slug = ?').get(slug)
  return row ? String((row as { code: string }).code) : ''
}

/** Suma de puertos (quantity) de un dispositivo. */
export function totalPuertos(db: SqliteDriver, slug: string): number {
  const row = db.prepare('SELECT COALESCE(SUM(p.quantity), 0) AS total FROM port p JOIN device d ON d.id = p.device_id WHERE d.slug = ?').get(slug)
  return Number((row as { total: number }).total)
}

/** Capas que termina un dispositivo (osi_profile_json). */
export function capasDe(db: SqliteDriver, slug: string): number[] {
  const row = db.prepare('SELECT osi_profile_json FROM device WHERE slug = ?').get(slug)
  if (!row) return []
  return parsearCapas(slug, String((row as { osi_profile_json: string }).osi_profile_json))
}

/**
 * Parsea y valida `{ terminate: number[] }`. Un perfil sin capas declaradas no
 * es un error; un perfil ilegible o con la forma equivocada se avisa y se
 * degrada a «sin capas» para que el asistente siga respondiendo.
 */
function parsearCapas(slug: string, json: string): number[] {
  let perfil: unknown
  try {
    perfil = JSON.parse(json)
  } catch (error) {
    console.warn(`[WARN] dispositivo ${slug}: osi_profile_json ilegible`, { error })
    return []
  }
  if (typeof perfil !== 'object' || perfil === null) {
    console.warn(`[WARN] dispositivo ${slug}: osi_profile_json no es un objeto`, { perfil })
    return []
  }
  const terminate = (perfil as { terminate?: unknown }).terminate
  if (terminate === undefined) return []
  if (!Array.isArray(terminate) || !terminate.every((n) => typeof n === 'number')) {
    console.warn(`[WARN] dispositivo ${slug}: "terminate" no es una lista de números`, { terminate })
    return []
  }
  return terminate
}
