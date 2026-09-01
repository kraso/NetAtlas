import { Slug } from '../value-objects/slug.js'
import type { NodeType } from '../graph/graph.js'

/**
 * Módulo de topologías (sección 13.2–13.3 y 8.1): entidades de primer nivel
 * Topology + TopologyNode + TopologyEdge, con validación de integridad del
 * agregado y regla de compatibilidad de enlaces para el laboratorio (NET-HW-034).
 *
 * El esquema SQL guarda entity_id como INTEGER (device.id / category.id); el
 * dominio trabaja con (entityType, entitySlug) y el adaptador traduce, como
 * hace relationship con subject_id.
 */

export const TOPOLOGY_NODE_TYPES: readonly NodeType[] = ['device', 'category']

export type TopologyKind = 'reference' | 'user'

export interface TopologyNodeProps {
  readonly entityType: NodeType
  readonly entitySlug: string
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly layerHint?: number | undefined
}

/** Nodo de una topología: referencia a una entidad del catálogo + coordenadas. */
export class TopologyNode {
  readonly entityType: NodeType
  readonly entitySlug: string
  readonly x?: number
  readonly y?: number
  readonly layerHint?: number

  private constructor(props: TopologyNodeProps) {
    if (!TOPOLOGY_NODE_TYPES.includes(props.entityType)) {
      throw new Error(`TopologyNode: tipo de entidad no permitido "${props.entityType}" (device|category).`)
    }
    if (props.x !== undefined && !Number.isFinite(props.x)) {
      throw new Error('TopologyNode: coordenada x debe ser finita.')
    }
    if (props.y !== undefined && !Number.isFinite(props.y)) {
      throw new Error('TopologyNode: coordenada y debe ser finita.')
    }
    this.entityType = props.entityType
    this.entitySlug = props.entitySlug
    this.x = props.x
    this.y = props.y
    this.layerHint = props.layerHint
    Object.freeze(this)
  }

  static create(props: TopologyNodeProps): TopologyNode {
    return new TopologyNode(props)
  }

  /** Id estable del nodo dentro del grafo de la topología: `device:slug`. */
  get id(): string {
    return `${this.entityType}:${this.entitySlug}`
  }

  /** Copia inmutable con posición (persistencia de layout, NET-HW-033). */
  withPosition(x: number, y: number): TopologyNode {
    return new TopologyNode({ ...this, x, y })
  }
}

export interface TopologyEdgeProps {
  readonly from: string
  readonly to: string
  readonly linkKind?: string | undefined
  readonly mediumCode?: string | undefined
  readonly label?: string | undefined
}

/** Enlace entre dos nodos (from → to); ambos referencian ids de nodo. */
export class TopologyEdge {
  readonly from: string
  readonly to: string
  readonly linkKind: string
  readonly mediumCode?: string
  readonly label?: string

  private constructor(props: TopologyEdgeProps) {
    if (props.from === props.to) {
      throw new Error(`TopologyEdge: no se permite un enlace de un nodo consigo mismo ("${props.from}").`)
    }
    this.from = props.from
    this.to = props.to
    this.linkKind = props.linkKind ?? 'link'
    this.mediumCode = props.mediumCode
    this.label = props.label
    Object.freeze(this)
  }

  static create(props: TopologyEdgeProps): TopologyEdge {
    return new TopologyEdge(props)
  }

  get id(): string {
    return `${this.from}→${this.to}`
  }
}

export interface TopologyProps {
  readonly slug: string
  readonly name: string
  readonly kind: TopologyKind
  readonly nodes: readonly TopologyNodeProps[]
  readonly edges: readonly TopologyEdgeProps[]
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

/** Agregado Topology: valida ids únicos de nodo y aristas bien formadas. */
export class Topology {
  readonly slug: Slug
  readonly name: string
  readonly kind: TopologyKind
  readonly nodes: readonly TopologyNode[]
  readonly edges: readonly TopologyEdge[]
  readonly metadata: Readonly<Record<string, unknown>>

  private constructor(props: TopologyProps) {
    this.slug = Slug.create(props.slug)
    this.name = props.name
    this.kind = props.kind
    this.metadata = props.metadata ?? {}

    const nodes = props.nodes.map((n) => TopologyNode.create(n))
    const ids = new Set<string>()
    for (const n of nodes) {
      if (ids.has(n.id)) {
        throw new Error(`Topology "${props.slug}": id de nodo duplicado "${n.id}".`)
      }
      ids.add(n.id)
    }

    const edges = props.edges.map((e) => TopologyEdge.create(e))
    const pares = new Set<string>()
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) {
        throw new Error(`Topology "${props.slug}": el enlace "${e.id}" referencia un nodo inexistente.`)
      }
      const par = [e.from, e.to].sort().join('|')
      if (pares.has(par)) {
        throw new Error(`Topology "${props.slug}": enlace duplicado entre "${e.from}" y "${e.to}".`)
      }
      pares.add(par)
    }

    this.nodes = Object.freeze([...nodes])
    this.edges = Object.freeze([...edges])
    Object.freeze(this)
  }

  static create(props: TopologyProps): Topology {
    return new Topology(props)
  }

  nodeById(id: string): TopologyNode | undefined {
    return this.nodes.find((n) => n.id === id)
  }

  /** Copia inmutable con las posiciones dadas (layout persistido). */
  withLayout(positions: ReadonlyArray<{ nodeId: string; x: number; y: number }>): Topology {
    const porNode = new Map(positions.map((p) => [p.nodeId, p]))
    const nodes = this.nodes.map((n) => {
      const pos = porNode.get(n.id)
      return pos ? n.withPosition(pos.x, pos.y) : n
    })
    return new Topology({
      slug: this.slug.value,
      name: this.name,
      kind: this.kind,
      nodes: nodes.map((n) => ({ entityType: n.entityType, entitySlug: n.entitySlug, x: n.x, y: n.y, layerHint: n.layerHint })),
      edges: this.edges.map((e) => ({ from: e.from, to: e.to, linkKind: e.linkKind, mediumCode: e.mediumCode, label: e.label })),
      metadata: this.metadata,
    })
  }
}

// ── Validación de compatibilidad de enlaces (NET-HW-034) ─────────────────────

export interface LinkCompatibilityInput {
  /** Velocidades de los puertos del nodo origen (Mbps). */
  readonly fromSpeeds: readonly number[]
  /** Velocidades de los puertos del nodo destino. */
  readonly toSpeeds: readonly number[]
  /** ¿Existe una arista "compatible-with" curada entre ambos dispositivos? */
  readonly curatedCompatible: boolean
}

export interface LinkCompatibilityResult {
  readonly ok: boolean
  readonly reason?: string | undefined
}

/**
 * Regla de compatibilidad al conectar dos dispositivos en el laboratorio:
 * se permite el enlace si comparten al menos una velocidad de interfaz o si
 * existe compatibilidad curada (arista compatible-with). Deterministica y pura.
 */
export function validateLinkCompatibility(input: LinkCompatibilityInput): LinkCompatibilityResult {
  const comunes = input.fromSpeeds.filter((s) => input.toSpeeds.includes(s))
  if (input.curatedCompatible) {
    return { ok: true }
  }
  if (comunes.length > 0) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `Sin interfaz común (origen: ${input.fromSpeeds.join('/') || '—'} Mbps · destino: ${input.toSpeeds.join('/') || '—'} Mbps) ni compatibilidad curada.`,
  }
}