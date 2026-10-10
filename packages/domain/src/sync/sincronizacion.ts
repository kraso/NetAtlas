import type { OutboxRepository } from './sync-outbox.js'
import type { ReplicaRepository, SyncResultado, SyncServer } from './sync-contratos.js'

/**
 * Dominio de sincronización (F8A, §23.4/§6.7, NET-HW-063).
 *
 * Separa las tres piezas del patrón outbox + réplica:
 *  - `OutboxEntry`/`OutboxRepository`: contribuciones locales pendientes
 *    (notas, propuestas de corrección) que se suben cuando hay red.
 *  - `SyncServer`/`ReplicaRepository`: pull de snapshot/delta y push de la
 *    cola, con last-writer-wins por (entidad, updatedAt).
 *  - `sincronizar()`: orquestación pura — nada de HTTP/SQL aquí.
 *
 * Los contratos (mapa de datos del snapshot y puertos) viven en
 * `sync-contratos.ts` y la cola de contribuciones en `sync-outbox.ts`; esta
 * cabecera solo orquesta y reexporta ambas superficies para mantener el API.
 *
 * El dominio no distingue local/servidor: misma interfaz, distinta latencia
 * (§23.4[3]). La tabla outbox es runtime-only: NO forma parte del dataset
 * firmado (el manifiesto cubre el catálogo publicado, no los datos de usuario).
 */

export { crearOutboxEntry, mergeLWWporEntidad } from './sync-outbox.js'
export type { CrearOutboxInput, OutboxEntry, OutboxRepository, TipoContribucion } from './sync-outbox.js'

export type {
  ReplicaRepository,
  SyncAssertion,
  SyncAttributeValue,
  SyncAttributeDefinition,
  SyncCatalogs,
  SyncDatasheet,
  SyncDevice,
  SyncDeviceDetail,
  SyncDeviceRelation,
  SyncImage,
  SyncPort,
  SyncResultado,
  SyncServer,
  SyncSource,
} from './sync-contratos.js'

/**
 * Orquesta un ciclo de sincronización (puro, sin I/O):
 * 1) pull snapshot del servidor → aplicar a la réplica (LWW por version);
 * 2) push contribuciones pendientes → marcar las confirmadas.
 * Si el pull o el push fallan, la cola local queda intacta (no se pierde nada).
 */
export async function sincronizar(
  outbox: OutboxRepository,
  servidor: SyncServer,
  replica: ReplicaRepository,
): Promise<SyncResultado> {
  const pull = await ejecutarPull(servidor, replica)
  const push = await ejecutarPush(outbox, servidor)
  const contribucionesPendientes = (await outbox.pendientes()).length
  return {
    replicados: pull.replicados,
    versionReplica: pull.versionReplica,
    contribucionesEnviadas: push.enviadas,
    contribucionesPendientes,
    pullOk: pull.ok,
    pushOk: push.ok,
  }
}

/** 1) Pull de catálogo (last-writer-wins por versión); sin red conserva versión. */
async function ejecutarPull(
  servidor: SyncServer,
  replica: ReplicaRepository,
): Promise<{ replicados: number; versionReplica: number; ok: boolean }> {
  let versionLocal: number
  try {
    versionLocal = await replica.version()
  } catch (error) {
    // Sin versión de réplica no hay desde dónde pedir el delta: se rinde.
    throw new Error(`sincronizar: no se pudo leer la versión de la réplica: ${mensaje(error)}`)
  }
  try {
    const dispositivos = await servidor.pullSnapshot(versionLocal)
    if (dispositivos.length === 0) return { replicados: 0, versionReplica: versionLocal, ok: true }
    const resultado = await replica.aplicarDevices(dispositivos)
    return { replicados: resultado.aplicados, versionReplica: resultado.version, ok: true }
  } catch (error) {
    // Best-effort explícito: sin red la réplica conserva su versión.
    console.warn('[WARN] pull de catálogo falló; la réplica conserva su versión', { error })
    return { replicados: 0, versionReplica: versionLocal, ok: false }
  }
}

/** 2) Push de la cola outbox (nunca se borra sin confirmación del servidor). */
async function ejecutarPush(outbox: OutboxRepository, servidor: SyncServer): Promise<{ enviadas: number; ok: boolean }> {
  const pendientes = await outbox.pendientes()
  if (pendientes.length === 0) return { enviadas: 0, ok: true }
  try {
    const confirmadas = await servidor.pushContribuciones(pendientes)
    if (confirmadas.length === 0) return { enviadas: 0, ok: true }
    await outbox.marcarEnviadas(confirmadas)
    return { enviadas: confirmadas.length, ok: true }
  } catch (error) {
    // Best-effort explícito: sin red / servidor caído la cola queda para el
    // siguiente ciclo (nunca se borra sin confirmación).
    console.warn('[WARN] push de contribuciones falló; la cola queda pendiente', { pendientes: pendientes.length, error })
    return { enviadas: 0, ok: false }
  }
}

/** Mensaje legible de un error desconocido (para contexto de propagación). */
function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}