/**
 * Módulo de calidad del dominio (PLAN MAESTRO §F2 / NET-HW-047):
 * métricas puras de cobertura del dataset, compartidas por todos los
 * adaptadores (in-memory, SQLite, servidor) — un solo origen de verdad.
 */
export {
  calcularCoberturaCritica,
  PASIVAS,
} from './cobertura.js'
export type {
  DatoCritico,
  DispositivoCriticoInput,
  CoberturaCriticaItem,
  CoberturaCriticaResultado,
} from './cobertura.js'