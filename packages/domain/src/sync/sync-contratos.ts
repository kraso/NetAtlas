import type { OutboxEntry } from './sync-outbox.js'

/**
 * Contratos de sincronización (F8A, §23.4/§6.7, NET-HW-063): el mapa de
 * datos que viaja en el snapshot y los puertos de servidor y réplica. Solo
 * tipos, para que la orquestación (`sincronizar`) sea un módulo corto.
 */

/** El servidor remoto visto desde el cliente (contrato de transporte). */
export interface SyncServer {
  /** Versión actual del catálogo en el servidor. */
  serverVersion(): Promise<number>
  /** Snapshot completo de dispositivos del servidor (para réplica inicial). */
  pullSnapshot(since: number): Promise<readonly SyncDevice[]>
  /** Envía contribuciones pendientes; devuelve las confirmadas. */
  pushContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]>
}

/** Réplica local del catálogo del servidor (misma interfaz que v1 local). */
export interface ReplicaRepository {
  version(): Promise<number>
  /** Aplica un snapshot (upsert por slug, last-writer-wins por version). */
  aplicarDevices(dispositivos: readonly SyncDevice[]): Promise<{ aplicados: number; version: number }>
  /** Conteo de dispositivos replicados (para diagnósticos). */
  count(): Promise<number>
}

/** Resultado de un ciclo de sincronización. */
export interface SyncResultado {
  /** Dispositivos aplicados a la réplica en este ciclo. */
  replicados: number
  /** Versión de réplica tras el ciclo. */
  versionReplica: number
  /** Contribuciones enviadas y confirmadas por el servidor. */
  contribucionesEnviadas: number
  /** Contribuciones que quedaron pendientes (sin red o rechazadas). */
  contribucionesPendientes: number
  /** ¿El pull de catálogo se completó? (false = red/servidor no disponibles). */
  pullOk: boolean
  /** ¿El push de la cola se completó? (false = se quedó pendiente). */
  pushOk: boolean
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

/**
 * Arista de catálogo (protocolos, capas, estándares, medios) con objeto por
 * código. `sourceSlug` viaja para que el cliente distinga las aristas curadas
 * de las generadas por herramienta (fuente sintética).
 */
export interface SyncDeviceRelation {
  readonly predicate: string
  readonly objectType: 'protocol' | 'standard' | 'layer' | 'medium' | 'interface' | 'technology' | 'device'
  readonly objectCode: string
  readonly sourceSlug?: string | undefined
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