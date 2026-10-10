import type { SqliteDriver } from '@netatlas/data'
import type { RawRecord } from './raw-record.js'

/**
 * Tipos del pipeline de importación (§19.2): el contrato de cada etapa
 * (normaliza → valida → dedup → reconcilia → persiste) y del informe de lote.
 * Viven aparte para que cada etapa sea un módulo pequeño y testeable sola.
 */

export interface ValidationIssue {
  readonly recordIndex: number
  readonly rule: string
  readonly message: string
}

export interface Reconciliation {
  readonly status: 'nuevo' | 'actualizacion' | 'conflicto' | 'sin-cambio'
  readonly slug: string
  readonly detail?: string
}

/** Candidato a revisión humana: par entrante/existente con scoring y diff (F6). */
export interface ConflictoDetalle {
  readonly entradaSlug: string
  readonly existenteSlug: string
  readonly score: number
  readonly diff: readonly { campo: string; entrante: string; existente: string }[]
}

export interface BatchReport {
  readonly total: number
  readonly altas: number
  readonly actualizaciones: number
  readonly conflictos: number
  readonly rechazos: number
  readonly sinCambio: number
  readonly validaciones: readonly ValidationIssue[]
  readonly reconciliaciones: readonly Reconciliation[]
  readonly conflictosDetalle: readonly ConflictoDetalle[]
}

export interface ImportDeps {
  readonly driver: SqliteDriver
  /** Catálogos cerrados para validación de extremos. */
  readonly knownProtocols?: ReadonlySet<string>
  readonly knownStandards?: ReadonlySet<string>
  readonly knownMedia?: ReadonlySet<string>
}

export interface DedupKey {
  readonly manufacturerSlug: string
  readonly model: string
}

export interface ReconciliarResultado {
  readonly reconciliaciones: Reconciliation[]
  readonly nuevos: RawRecord[]
  /** Fusión automática (score ≥ 0.98): slug entrante → slug existente. */
  readonly reescritura: ReadonlyMap<string, string>
  /** Candidatos a revisión (0.7–0.98) con score y diff. */
  readonly conflictos: readonly ConflictoDetalle[]
}

export interface ReconciliarOpciones {
  /** Notifica cada candidato a revisión (el CLI lo inserta en reconciliation). */
  readonly onConflicto?: (c: ConflictoDetalle) => void
}

export interface PersistResult {
  readonly report: BatchReport
  readonly persisted: number
}

/** Estado persistido de los dispositivos para el dedup (manufacturer+model+sku). */
export interface Existente {
  readonly slug: string
  readonly manufacturerSlug: string
  readonly model: string
  readonly sku: string
  readonly name: string
}