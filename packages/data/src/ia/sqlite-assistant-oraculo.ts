import type { SqliteDriver } from '../driver.js'
import type { HechoIA, OracleHechos } from '@netatlas/domain'
import type { SqlRowValue } from './sqlite-assistant-helpers.js'
import { valorLegible } from './sqlite-assistant-helpers.js'

/**
 * Oráculo del evaluador (§21.3): un hecho citado existe si hay una assertion
 * con ese (subject|null) o un dato de catálogo equivalente. Se usa para el
 * criterio "0 alucinaciones de specs" en el conjunto de oro.
 *
 * Cada familia de predicado tiene su comprobación; el reparto lo hace
 * `comprobarHecho` para que el oráculo no sea una única función larga.
 */

/** Predicados de relación y su nombre interno en el grafo (§8.3). */
const PREDICADO_RELACION: Readonly<Record<string, string>> = {
  'reemplaza a': 'replaced-by',
  'sucede a': 'succeeds',
  'precede a': 'precedes',
  'compatible con': 'compatible-with',
}

export function crearOracleSqlite(db: SqliteDriver): OracleHechos {
  return async (h: HechoIA): Promise<boolean> => comprobarHecho(db, h)
}

/** Comprueba un hecho citado contra assertions y catálogo. */
function comprobarHecho(db: SqliteDriver, h: HechoIA): boolean {
  if (h.predicado === 'categoria') return comprobarCategoria(db, h)
  if (h.predicado === 'fabricante' || h.predicado === 'lanza') return comprobarFabricanteOAnio(db, h)
  if (h.predicado === 'puertos') return comprobarPuertos(db, h)
  if (h.predicado === 'capas que termina' || h.predicado === 'capas transparente') return comprobarCapas(db, h)
  if (h.predicado === 'comparacion') return true // derivado del motor puro (no spec)
  if (h.predicado === 'topologia generada') return existeTopologia(db, h.sujetoSlug)
  const interno = PREDICADO_RELACION[h.predicado]
  if (interno !== undefined) return comprobarRelacion(db, h, interno)
  return comprobarAssertion(db, h)
}

/** Categoría del dispositivo por nombre legible. */
function comprobarCategoria(db: SqliteDriver, h: HechoIA): boolean {
  const row = db
    .prepare('SELECT c.name_es AS name FROM device d JOIN category c ON c.id = d.category_id WHERE d.slug = ?')
    .get(h.sujetoSlug)
  return row !== undefined && String((row as { name: string }).name).toLowerCase() === h.valor.toLowerCase()
}

/** Fabricante por slug, o año de lanzamiento (`lanza`) aceptando año o fecha. */
function comprobarFabricanteOAnio(db: SqliteDriver, h: HechoIA): boolean {
  const row = db
    .prepare('SELECT m.slug AS m, d.released_on AS rel FROM device d JOIN manufacturer m ON m.id = d.manufacturer_id WHERE d.slug = ?')
    .get(h.sujetoSlug)
  if (!row) return false
  const r = row as { m: string; rel: string | null }
  if (h.predicado === 'fabricante') return r.m.toLowerCase() === h.valor.toLowerCase()
  return h.valor === String(r.rel ?? '').slice(0, 4) || (r.rel !== null && h.valor === String(r.rel))
}

/** Suma de puertos frente al número citado. */
function comprobarPuertos(db: SqliteDriver, h: HechoIA): boolean {
  const row = db
    .prepare('SELECT COALESCE(SUM(p.quantity), 0) AS total FROM port p JOIN device d ON d.id = p.device_id WHERE d.slug = ?')
    .get(h.sujetoSlug)
  return row !== undefined && Number((row as { total: number }).total) === Number(h.valor)
}

/** Capas que termina o atraviesa, comparadas como lista «n, n, n». */
function comprobarCapas(db: SqliteDriver, h: HechoIA): boolean {
  const perfil = perfilOsiDe(db, h.sujetoSlug)
  if (!perfil) return false
  const capas = h.predicado === 'capas que termina' ? perfil.terminate : perfil.transparent
  return capas.join(', ') === h.valor
}

/** Perfil OSI del dispositivo; `undefined` si no existe o es ilegible (con aviso). */
function perfilOsiDe(db: SqliteDriver, slug: string): { terminate: number[]; transparent: number[] } | undefined {
  const row = db.prepare('SELECT osi_profile_json FROM device WHERE slug = ?').get(slug)
  if (!row) return undefined
  const osiJson = String((row as { osi_profile_json: string }).osi_profile_json)
  try {
    return JSON.parse(osiJson) as { terminate: number[]; transparent: number[] }
  } catch (error) {
    console.warn(`[WARN] oráculo: osi_profile_json ilegible en "${slug}"`, { error })
    return undefined
  }
}

/** ¿Existe la arista curada entre dos dispositivos con ese predicado? */
function comprobarRelacion(db: SqliteDriver, h: HechoIA, predicadoInterno: string): boolean {
  const row = db
    .prepare(
      `SELECT 1
       FROM relationship r
       JOIN device a ON r.subject_type = 'device' AND r.subject_id = a.id
       JOIN device b ON r.object_type = 'device' AND r.object_id = b.id
       WHERE a.slug = ? AND b.slug = ? AND r.predicate = ?`,
    )
    .get(h.sujetoSlug, h.valor, predicadoInterno)
  return row !== undefined
}

/** ¿Se generó y persistió esa topología? */
function existeTopologia(db: SqliteDriver, slug: string): boolean {
  return db.prepare('SELECT 1 FROM topology WHERE slug = ?').get(slug) !== undefined
}

/** Predicado genérico: debe existir una assertion con ese valor (o su versión sin sufijo). */
function comprobarAssertion(db: SqliteDriver, h: HechoIA): boolean {
  const rows = db
    .prepare(
      `SELECT a.value_json FROM assertion a JOIN device d ON a.subject_type = 'device' AND a.subject_id = d.id
       WHERE d.slug = ? AND a.predicate = ?`,
    )
    .all(h.sujetoSlug, h.predicado) as unknown as SqlRowValue[]
  return rows.some((r) => {
    const v = valorLegible(h.predicado, String(r.value_json))
    return v === h.valor || v === h.valor.replace(/\s*[A-Za-z/]+$/, '')
  })
}
