import { Topology, validateLinkCompatibility } from '@netatlas/domain'
import type { TopologyNodeProps } from '@netatlas/domain'
import type { AppServices } from '../composition-root.js'
import { proyectarArista, proyectarNodo } from './topology-proyecciones.js'

/**
 * Lógica pura del laboratorio-editor (NET-HW-034): mutaciones inmutables de
 * la topología y validación de enlaces por el criterio del dominio.
 */

export interface ResultadoConexion {
  readonly ok: boolean
  readonly mensaje?: string
  readonly topologia?: Topology
}

/** Topología con un nodo añadido (inmutable). */
export function conNodo(topologia: Topology, nodo: TopologyNodeProps): Topology {
  return Topology.create({
    slug: topologia.slug.value,
    name: topologia.name,
    kind: topologia.kind,
    nodes: [...topologia.nodes.map(proyectarNodo), nodo],
    edges: topologia.edges.map(proyectarArista),
    metadata: topologia.metadata,
  })
}

/** Topología sin el nodo dado ni sus enlaces (inmutable). */
export function sinNodo(topologia: Topology, id: string): Topology {
  return Topology.create({
    slug: topologia.slug.value,
    name: topologia.name,
    kind: topologia.kind,
    nodes: topologia.nodes.filter((n) => n.id !== id).map(proyectarNodo),
    edges: topologia.edges.filter((e) => e.from !== id && e.to !== id).map(proyectarArista),
    metadata: topologia.metadata,
  })
}

/** Id de nodo `tipo:slug` descompuesto en sus partes (falla fuerte si no lo es). */
function peer(id: string): { slug: string; tipo: string } {
  const i = id.indexOf(':')
  if (i <= 0 || i === id.length - 1) {
    throw new Error(`Nodo con id mal formado: se espera "tipo:slug" (recibido "${id}").`)
  }
  return { tipo: id.slice(0, i), slug: id.slice(i + 1) }
}

/** Motivo de rechazo si la selección no es un par de nodos válidos. */
function validarSeleccion(origen: string, destino: string): string | undefined {
  if (!origen || !destino || origen === destino) return 'Selecciona dos nodos distintos para conectar.'
  return undefined
}

/** Velocidades de ambos extremos + compatibilidad curada existente (§13.4). */
async function compatibilidadDeEnlace(
  origen: string,
  destino: string,
  services: Pick<AppServices, 'devices' | 'graph'>,
): Promise<{ speedsA: number[]; speedsB: number[]; curada: boolean }> {
  const { devices, graph } = services
  const a = peer(origen)
  const b = peer(destino)
  const [da, db] = [
    a.tipo === 'device' ? await devices.findBySlug(a.slug) : undefined,
    b.tipo === 'device' ? await devices.findBySlug(b.slug) : undefined,
  ]
  const aristasA = a.tipo === 'device' ? await graph.edgesOf({ type: 'device', slug: a.slug }) : []
  const curada = aristasA.some(
    (r) => r.predicate === 'compatible-with' && r.object.type === 'device' && r.object.slug === b.slug && b.tipo === 'device',
  )
  return { speedsA: da?.ports.flatMap((p) => p.speedsMbps) ?? [], speedsB: db?.ports.flatMap((p) => p.speedsMbps) ?? [], curada }
}

/** Topología con el enlace añadido (inmutable, sin duplicar). */
function conEnlace(topologia: Topology, origen: string, destino: string): Topology {
  return Topology.create({
    slug: topologia.slug.value,
    name: topologia.name,
    kind: topologia.kind,
    nodes: topologia.nodes.map(proyectarNodo),
    edges: [...topologia.edges.map(proyectarArista), { from: origen, to: destino, label: 'enlace' }],
    metadata: topologia.metadata,
  })
}

/** ¿Ya existe el mismo enlace en cualquiera de las dos direcciones? */
function enlaceYaExiste(topologia: Topology, origen: string, destino: string): boolean {
  return topologia.edges.some((e) => (e.from === origen && e.to === destino) || (e.from === destino && e.to === origen))
}

/**
 * Valida y conecta dos nodos: interfaz común por velocidades de puerto o
 * compatibilidad curada (regla del dominio), sin duplicar enlaces. Devuelve
 * el mensaje concreto del rechazo o la topología con el enlace añadido.
 */
export async function validarYConectar(arg: {
  readonly topologia: Topology
  readonly origen: string
  readonly destino: string
  readonly services: Pick<AppServices, 'devices' | 'graph'>
}): Promise<ResultadoConexion> {
  const { topologia, origen, destino, services } = arg
  const seleccion = validarSeleccion(origen, destino)
  if (seleccion) return { ok: false, mensaje: seleccion }
  const { speedsA, speedsB, curada } = await compatibilidadDeEnlace(origen, destino, services)
  const resultado = validateLinkCompatibility({ fromSpeeds: speedsA, toSpeeds: speedsB, curatedCompatible: curada })
  if (!resultado.ok) return { ok: false, mensaje: resultado.reason }
  if (enlaceYaExiste(topologia, origen, destino)) return { ok: false, mensaje: 'Ese enlace ya existe.' }
  return { ok: true, topologia: conEnlace(topologia, origen, destino) }
}
