import type { NodeSqliteDriver } from '@netatlas/data'

/** Conteos de los catálogos cerrados, leídos de la base ya sembrada. */
export interface ConteosCatalogos {
  readonly protocols: number
  readonly standards: number
  readonly media: number
  readonly manufacturers: number
  readonly categories: number
}

/** Conteos que describen el dataset recién sembrado. */
export interface ConteosDataset {
  readonly deviceCount: number
  readonly relationshipCount: number
  readonly assertionCount: number
  readonly catalogCounts: ConteosCatalogos
  readonly topologiasCount: number
  readonly schemaVersion: number
}

/**
 * Tablas contables del dataset: la lista cerrada es la única fuente de nombres
 * que llega al SQL (`contarFilas`), así que ninguna cadena suelta puede cambiar
 * la consulta.
 */
const TABLAS_CONTABLES = ['protocol', 'standard', 'medium', 'manufacturer', 'category', 'topology'] as const

/** Nombre de tabla contable (§9): el conjunto lo fija `TABLAS_CONTABLES`. */
type TablaContable = (typeof TABLAS_CONTABLES)[number]

/**
 * Conteo numérico de una celda: cualquier otra cosa (texto, `NaN`) es un fallo
 * del motor y rompe aquí, no en un `counts` del manifiesto inventado.
 */
function exigirConteo(valor: unknown, contexto: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error(`${contexto}: el conteo no es un número (${String(valor)}).`)
  }
  return valor
}

/**
 * Cuenta las filas de una tabla del dataset, dentro de la lista cerrada.
 * Una fila ausente es un fallo del motor, no un cero: se rompe fuerte en vez
 * de dejar que el conteo inventado acabe en el manifiesto.
 */
export function contarFilas(driver: NodeSqliteDriver, tabla: TablaContable): number {
  if (!TABLAS_CONTABLES.includes(tabla)) {
    throw new Error(`contarFilas: "${tabla}" no es una tabla contable del dataset.`)
  }
  const fila = driver.prepare(`SELECT COUNT(*) AS c FROM ${tabla}`).get()
  if (!fila) throw new Error(`contarFilas: la consulta de "${tabla}" no devolvió fila.`)
  return exigirConteo(fila.c, `contarFilas("${tabla}")`)
}

/** Conteos de catálogos cerrados del dataset generado. */
export function contarCatalogos(driver: NodeSqliteDriver): ConteosCatalogos {
  return {
    protocols: contarFilas(driver, 'protocol'),
    standards: contarFilas(driver, 'standard'),
    media: contarFilas(driver, 'medium'),
    manufacturers: contarFilas(driver, 'manufacturer'),
    categories: contarFilas(driver, 'category'),
  }
}

/**
 * Última versión de esquema aplicada. Una fila ausente se rompe; `NULL` —no se
 * aplicó ninguna migración— es la versión 0, el mismo criterio que
 * `versionActual` del migrador.
 */
export function versionDeEsquema(driver: NodeSqliteDriver): number {
  const fila = driver.prepare('SELECT MAX(version) AS v FROM schema_version').get()
  if (!fila) throw new Error('versionDeEsquema: la consulta de schema_version no devolvió fila.')
  if (fila.v === null || fila.v === undefined) return 0
  return exigirConteo(fila.v, 'versionDeEsquema')
}
