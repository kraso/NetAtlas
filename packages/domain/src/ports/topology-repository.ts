import type { Topology } from '../topologies/topology.js'

/**
 * Puerto de topologías (sección 13.3 / NET-HW-033–034): visor de topologías de
 * referencia + persistencia de layout + laboratorio de topologías de usuario.
 * Implementaciones: SqliteTopologyRepository (packages/data) y el adaptador
 * in-memory de la UI (mismo contrato; wa-sqlite en el navegador idem).
 */

export interface TopologyPosition {
  readonly nodeId: string
  readonly x: number
  readonly y: number
}

export interface TopologyRepository {
  /** Todas las topologías (referencia y de usuario). */
  list(): Promise<readonly Topology[]>
  bySlug(slug: string): Promise<Topology | undefined>
  /** Crea o reemplaza una topología (agregado ya validado por el dominio). */
  upsert(topology: Topology): Promise<void>
  /** Persiste solo las coordenadas (arrastrar y soltar en el visor). */
  saveLayout(slug: string, positions: ReadonlyArray<TopologyPosition>): Promise<void>
  remove(slug: string): Promise<void>
}