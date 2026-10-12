/**
 * Caso de uso: Importación por lotes (§19.2, NET-HW-050).
 *
 * Orquesta el pipeline de importación (normalizar→validar→reconciliar→persistir)
 * a través de puertos, produciendo un reporte de lote (BatchReport).
 *
 * La persistencia física (SQLite/CatalogDao) vive en packages/importers +
 * packages/data; aquí se reutiliza el tipo SqliteDriver y ImportDeps ya
 * definidos, de modo que el caso de uso es reutilizable por el servidor (F8A)
 * o el CLI sin acoplarse a implementaciones concretas.
 */
import { runImport } from '@netatlas/importers'
import type { RawRecord, BatchReport, ImportDeps } from '@netatlas/importers'

export interface ImportarLoteInput {
  readonly rawRecords: readonly RawRecord[]
  readonly deps: ImportDeps
  readonly onConflicto?: (c: unknown) => void
}

export interface ImportarLoteResult {
  readonly report: BatchReport
}

/**
 * Ejecuta el pipeline completo sobre un lote de registros crudos.
 * Delega a runImport de @netatlas/importers, proporcionando el driver SQLite
 * e inventarios de catálogos cerrados (NET-HW-005/006).
 */
export async function importarLote(input: ImportarLoteInput): Promise<ImportarLoteResult> {
  const { rawRecords, deps, onConflicto } = input
  const report = runImport(rawRecords, deps, { onConflicto })
  return { report }
}
