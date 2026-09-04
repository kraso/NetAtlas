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
 * El dominio no distingue local/servidor: misma interfaz, distinta latencia
 * (§23.4[3]). La tabla outbox es runtime-only: NO forma parte del dataset
 * firmado (el manifiesto cubre el catálogo publicado, no los datos de usuario).
 */

/** Tipos de contribución que el usuario puede aportar desde la app. */
export type TipoContribucion = 'nota' | 'propuesta-correccion' | 'propuesta-entity'

export interface OutboxEntry {
  readonly id: string
  readonly tipo: TipoContribucion
  /** Entidad objetivo (device:slug, glossary:slug, …). */
  readonly entidad: string
  /** Slug del usuario/autor (local-first; el servidor valida). */
  readonly autor: string
  /** Payload JSON-safe con la corrección/nota (datos, nunca código). */
  readonly payload: Readonly<Record<string, unknown>>
  readonly createdAt: string
  /** Monótono por cliente: para last-writer-wins y merge dedup. */
  readonly revision: number
  readonly status: 'pendiente' | 'enviada'
}

export interface CrearOutboxInput {
  readonly tipo: TipoContribucion
  readonly entidad: string
  readonly autor: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly revision: number
}

export function crearOutboxEntry(input: CrearOutboxInput, id: string, now: string): OutboxEntry {
  if (input.entidad.trim().length === 0) {
    throw new Error('OutboxEntry: entidad no puede estar vacía.')
  }
  if (input.autor.trim().length === 0) {
    throw new Error('OutboxEntry: autor no puede estar vacío.')
  }
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('OutboxEntry: revision debe ser entero ≥ 1.')
  }
  return {
    id,
    tipo: input.tipo,
    entidad: input.entidad,
    autor: input.autor,
    payload: Object.freeze({ ...input.payload }),
    createdAt: now,
    revision: input.revision,
    status: 'pendiente',
  }
}

/** Almacén local de la cola de contribuciones (outbox pattern, §23.4[3]). */
export interface OutboxRepository {
  /** Encola una contribución pendiente. */
  enqueue(entry: OutboxEntry): Promise<void>
  /** Contribuciones aún no enviadas (orden por createdAt). */
  pendientes(): Promise<readonly OutboxEntry[]>
  /** Marca como enviadas (solo si el servidor confirmó recepción). */
  marcarEnviadas(ids: readonly string[]): Promise<void>
  /** Última revisión usada (para asignar la siguiente). */
  ultimaRevision(): Promise<number>
  /** Última fecha de herramienta de entidad (para last-writer-wins). */
  ultimaModificacionEntidad(entidad: string): Promise<string | undefined>
}

/**
 * Merge last-writer-wins por ENTIDAD (§31.5 / F8A futuro): dado un lote de
 * contribuciones entrantes, resuelve la revisión más alta por entidad objetivo
 * y devuelve las que deben persistirse (las revisiones inferiores a la máxima
 * de su entidad se descartan — el cliente cree id empírico, revisión monotónica).
 *
 * Puro y testeable: un adaptador del servidor puede delegar la decisión aquí.
 */
export function mergeLWWporEntidad(entradas: readonly OutboxEntry[]): readonly OutboxEntry[] {
  const mejorPorEntidad = new Map<string, OutboxEntry>()
  for (const e of entradas) {
    const previa = mejorPorEntidad.get(e.entidad)
    if (!previa || e.revision > previa.revision) mejorPorEntidad.set(e.entidad, e)
  }
  // Salida determinista: orden por entidad (no por orden de llegada).
  return [...mejorPorEntidad.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, e]) => e)
}

/** El servidor remoto visto desde el cliente (contrato de transporte). */
export interface SyncServer {
  /** Versión actual del catálogo en el servidor. */
  serverVersion(): Promise<number>
  /** Snapshot completo de dispositivos del servidor (para réplica inicial). */
  pullSnapshot(since: number): Promise<readonly SyncDevice[]>
  /** Envía contribuciones pendientes; devuelve las confirmadas. */
  pushContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]>
}

/** Fila mínima de catálogo que viaja en el snapshot (solo datos planos). */
export interface SyncDevice {
  readonly slug: string
  readonly name: string
  readonly manufacturerSlug: string
  readonly categoryCode: string
  readonly lifecycleStatus: string
  readonly updatedAt: string
  /** Versión del cambio que la introdujo (ordena el merge). */
  readonly version: number
}

/** Puerto inventariado que viaja en el detalle del snapshot (F8B-detalle). */
export interface SyncPort {
  readonly label: string
  readonly interfaceCode: string
  readonly quantity: number
  readonly speedsMbps: readonly number[]
  readonly poeStandard?: string | undefined
  readonly role?: string | undefined
  readonly notes?: string | undefined
}

/** Arista de catálogo (protocolos, capas, estándares, medios) con objeto por código. */
export interface SyncDeviceRelation {
  readonly predicate: string
  readonly objectType: 'protocol' | 'standard' | 'layer' | 'medium' | 'interface' | 'technology' | 'device'
  readonly objectCode: string
}

/** Afirmación con fuente por slug (el cliente resuelve el objeto Source). */
export interface SyncAssertion {
  readonly predicate: string
  readonly valueJson: string
  readonly sourceSlug: string
  readonly confidence: string
  readonly verifiedOn: string
  readonly author: string
  readonly reviewedBy?: string | undefined
  readonly note?: string | undefined
}

/** Datasheet plano para el snapshot (F2-Documentación). */
export interface SyncDatasheet {
  readonly title: string
  readonly language: string
  readonly url?: string | undefined
  readonly localPath?: string | undefined
  readonly sourceSlug: string
}

/** Imagen plana para el snapshot (F2-Fotos). */
export interface SyncImage {
  readonly kind: string
  readonly caption?: string | undefined
  readonly localPath?: string | undefined
  readonly url?: string | undefined
  readonly sourceSlug: string
}

/** Fuente documental plana para el snapshot. */
export interface SyncSource {
  readonly slug: string
  readonly kind: string
  readonly publisher?: string | undefined
  readonly title: string
  readonly url?: string | undefined
  readonly retrievedOn?: string | undefined
  readonly authorityLevel: number
}

/** Definición de atributo EAV con su categoría (para facetas por subárbol). */
export interface SyncAttributeDefinition {
  readonly key: string
  readonly labelEs: string
  readonly valueType: string
  readonly unit?: string | undefined
  readonly enumValues?: readonly string[] | undefined
  readonly isFacet: boolean
  readonly isComparable: boolean
  readonly compareRule: string
  readonly categoryCode: string
}

/** Valor EAV de un dispositivo (display ya calculado en servidor). */
export interface SyncAttributeValue {
  readonly deviceSlug: string
  readonly key: string
  readonly display: string
}

/** Catálogos cerrados que viajan con el snapshot (evitan N consultas). */
export interface SyncCatalogs {
  readonly protocols: readonly { code: string; name: string; family: string; osiLayer: number }[]
  readonly standards: readonly { org: string; identifier: string; title: string }[]
  readonly media: readonly { code: string; kind: string; name: string; maxSpeedMbps?: number | undefined }[]
  readonly layers: readonly { number: number; nameEs: string }[]
  /** Empresa SNMP por fabricante (solo verificados; ausente = pendiente). */
  readonly manufacturers: readonly { slug: string; snmpEnterprise?: number | undefined }[]
}

/**
 * Detalle por dispositivo del snapshot F8B (ficha completa sin N+1):
 * resumen, perfil OSI, puertos, aristas de catálogo, afirmaciones y valores EAV.
 * Separado de SyncDevice para no alterar el flujo de réplica LWW existente.
 */
export interface SyncDeviceDetail {
  readonly slug: string
  readonly summary?: string | undefined
  readonly osiProfileJson?: string | undefined
  readonly ports: readonly SyncPort[]
  readonly relations: readonly SyncDeviceRelation[]
  readonly assertions: readonly SyncAssertion[]
  readonly attributeValues: readonly { key: string; display: string }[]
  readonly datasheets: readonly SyncDatasheet[]
  readonly images: readonly SyncImage[]
}

/** Réplica local del catálogo del servidor (misma interfaz que v1 local). */
export interface ReplicaRepository {
  version(): Promise<number>
  /** Aplica un snapshot (upsert por slug, last-writer-wins por version). */
  aplicarDevices(dispositivos: readonly SyncDevice[]): Promise<{ aplicados: number; version: number }>
  /** Conteo de dispositivos replicados (para diagnósticos). */
  count(): Promise<number>
}

export interface SyncResultado {
  /** Dispositivos aplicados a la réplica en este ciclo. */
  replicados: number
  /** Versión de réplica tras el ciclo. */
  versionReplica: number
  /** Contribuciones enviadas y confirmadas por el servidor. */
  contribucionesEnviadas: number
  /** Contribuciones que quedaron pendientes (sin red o rechazadas). */
  contribucionesPendientes: number
}

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
  let contribucionesEnviadas = 0
  let replicados = 0
  let versionReplica = 0

  // 1) Pull de catálogo (última-write-wins por versión). Sin red, la réplica
  //    conserva su versión y el ciclo solo reporta contribuciones pendientes.
  try {
    const versionLocal = await replica.version()
    const dispositivos = await servidor.pullSnapshot(versionLocal)
    if (dispositivos.length > 0) {
      const resultado = await replica.aplicarDevices(dispositivos)
      replicados = resultado.aplicados
      versionReplica = resultado.version
    } else {
      versionReplica = versionLocal
    }
  } catch {
    versionReplica = await replica.version()
  }

  // 2) Push de la cola outbox (nunca se borra sin confirmación del servidor).
  const pendientes = await outbox.pendientes()
  if (pendientes.length > 0) {
    try {
      const confirmadas = await servidor.pushContribuciones(pendientes)
      if (confirmadas.length > 0) {
        await outbox.marcarEnviadas(confirmadas)
        contribucionesEnviadas = confirmadas.length
      }
    } catch {
      // Sin red / servidor caído: la cola permanece para el siguiente ciclo.
      contribucionesEnviadas = 0
    }
  }

  const stillPendientes = await outbox.pendientes()
  return {
    replicados,
    versionReplica,
    contribucionesEnviadas,
    contribucionesPendientes: stillPendientes.length,
  }
}