import type { RawRecord } from './raw-record.js'
import { normalizar } from './pipeline-normalizar.js'
import { validar } from './pipeline-validar.js'
import { reconciliar } from './pipeline-reconciliar.js'
import { persistir } from './pipeline-persistir.js'
import type { BatchReport, ImportDeps, ReconciliarOpciones } from './pipeline-tipos.js'

/**
 * Pipeline de importación (§19.2): parse → normaliza → valida → dedup →
 * reconcilia → persiste. Cada etapa es testeable de forma independiente.
 *
 * Las etapas viven en módulos propios (`pipeline-normalizar.ts`,
 * `pipeline-validar.ts`, `pipeline-dedup.ts`, `pipeline-reconciliar.ts`,
 * `pipeline-persistir.ts`) y los contratos en `pipeline-tipos.ts`; esta
 * cabecera orquesta y re-exporta la superficie pública.
 *
 * Etapa 6 (persistir) es transaccional por lote: ante cualquier error duro
 * hace rollback completo; los registros rechazados por validación se excluyen
 * sin tocar el resto (nunca medio-escrito, criterio 28.1.6#5).
 */

export type {
  BatchReport,
  ConflictoDetalle,
  ImportDeps,
  PersistResult,
  ReconciliarOpciones,
  ReconciliarResultado,
  Reconciliation,
  ValidationIssue,
} from './pipeline-tipos.js'
export { normalizar } from './pipeline-normalizar.js'
export { validar } from './pipeline-validar.js'
export { agruparDuplicados, dedupKeyOf } from './pipeline-dedup.js'
export type { DedupKey } from './pipeline-tipos.js'
export { reconciliar } from './pipeline-reconciliar.js'
export { persistir } from './pipeline-persistir.js'

export interface RunImportOpciones extends ReconciliarOpciones {}

/**
 * Pipeline completo sobre un driver migrado: normaliza→valida→reconcilia→persiste.
 * El parse lo hace el llamante (parseJson/parseCsv/parseYaml/parseXml).
 */
export function runImport(records: readonly RawRecord[], deps: ImportDeps, opciones?: RunImportOpciones): BatchReport {
  const normalizados = normalizar(records)
  const { validos, issues } = validar(normalizados, deps)
  const { reconciliaciones, reescritura, conflictos } = reconciliar(validos, deps, opciones)
  const { report } = persistir(normalizados, validos, reconciliaciones, deps, reescritura, conflictos)
  return { ...report, validaciones: issues }
}