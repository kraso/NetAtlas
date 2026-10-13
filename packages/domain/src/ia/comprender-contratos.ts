import type { LlamadaHerramienta } from './assistant.js'

/**
 * Contratos de la comprensión de lenguaje natural (§21.1[1]): el escenario
 * reconocido y el plan de herramientas que la etapa determinista emite.
 * Un proveedor LLM cloud puede sustituir la etapa manteniendo este contrato.
 */

export type EscenarioIA =
  | 'asistente-tecnico'
  | 'generacion-diagramas'
  | 'explicacion-tecnica'
  | 'diagnostico'
  | 'comparacion'
  | 'busqueda'
  | 'no-entendido'

export interface PlanIA {
  readonly escenario: EscenarioIA
  /** Llamadas de herramienta a ejecutar en orden (0..n). */
  readonly llamadas: readonly LlamadaHerramienta[]
  /** Texto límite para búsqueda cuando no hay DSL estructurado. */
  readonly textoBusqueda?: string | undefined
  /** Slug explícito detectado (dispositivo principal del tema). */
  readonly slugPrincipal?: string | undefined
}
