import type { NodeType } from '../graph/graph.js'

/** Tipos de entidad permitidos como nodo de una topología (§13.2). */
export const TOPOLOGY_NODE_TYPES: readonly NodeType[] = ['device', 'category']

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
