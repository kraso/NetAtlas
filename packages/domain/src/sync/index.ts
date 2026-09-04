/**
 * Nuevo módulo de dominio: sincronización (F8A, §23.4 / NET-HW-063).
 */
export {
  crearOutboxEntry,
  sincronizar,
  mergeLWWporEntidad,
} from './sincronizacion.js'
export type {
  OutboxEntry,
  CrearOutboxInput,
  OutboxRepository,
  SyncServer,
  SyncDevice,
  SyncDeviceDetail,
  SyncPort,
  SyncDeviceRelation,
  SyncAssertion,
  SyncDatasheet,
  SyncSource,
  SyncAttributeDefinition,
  SyncAttributeValue,
  SyncCatalogs,
  ReplicaRepository,
  SyncResultado,
} from './sincronizacion.js'