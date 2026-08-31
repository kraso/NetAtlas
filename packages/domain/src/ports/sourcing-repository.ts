import type { Assertion, Source } from '../sourcing/assertion.js'

/**
 * Puerto SourcingRepository (sección 20.2).
 * Expone afirmaciones y fuentes trazables por sujeto — alimenta la pestaña
 * Referencias de la ficha y el dashboard de calidad del dataset.
 * La UI usa `assertionsForDevice(slug)`; nunca conoce ids internos.
 */
export interface SourcingRepository {
  /** Afirmaciones de un sujeto por su id interno (p. ej. device:123). */
  assertionsFor(subjectType: string, subjectId: number): Promise<readonly Assertion[]>
  /** Afirmaciones de un dispositivo por su slug (resuelve el id internamente). */
  assertionsForDevice(slug: string): Promise<readonly Assertion[]>
  /** Fuente por slug (para resolver referencias desde assertions). */
  sourceBySlug(slug: string): Promise<Source | undefined>
}