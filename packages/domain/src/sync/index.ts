/**
 * Nuevo módulo de dominio: sincronización (F8A, §23.4 / NET-HW-063).
 */
export {
  crearOutboxEntry,
  sincronizar,
} from './sincronizacion.js'
export type {
  OutboxEntry,
  CrearOutboxInput,
  OutboxRepository,
  SyncServer,
  SyncDevice,
  ReplicaRepository,
  SyncResultado,
} from './sincronizacion.js'