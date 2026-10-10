import type { CatalogDao } from '@netatlas/data'
import type { Seed } from './build-tipos.js'
import { seedProtocolStandards, PROTOCOL_STANDARD } from './build-estandares-logica.js'
import type { ConteosSiembra } from './build-estandares-logica.js'

/**
 * Estándares derivados (F2-asistido, confidence=derived): mapea protocolos con
 * estándar canónico e interfaces/PoE a su implements-standard. Solo mapeos
 * exactos (RFC/IEEE/ITU publicados); lo dudoso se omite, no se inventa.
 *
 * La constante `PROTOCOL_STANDARD`, las interfaces y la lógica de seed están
 * en `build-estandares-logica.ts`.
 */

export { PROTOCOL_STANDARD }
export type { ConteosSiembra }

/**
 * Mapea protocolos e interfaces a implements-standard curado (confidence=derived).
 *
 * Devuelve los conteos de assertions y relaciones creadas.
 */
export function seedDerivedStandards(dao: CatalogDao, seed: Seed): ConteosSiembra {
  return seedProtocolStandards(dao, seed)
}
