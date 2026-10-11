import { Slug } from '../value-objects/slug.js'
import { TopologyEdge } from './topology-enlace.js'
import { TopologyNode } from './topology-nodo.js'
import type { TopologyEdgeProps } from './topology-enlace.js'
import type { TopologyNodeProps } from './topology-nodo.js'

/**
 * Módulo de topologías (sección 13.2–13.3 y 8.1): el agregado Topology valida
 * ids únicos de nodo y aristas bien formadas; el nodo vive en
 * `topology-nodo.ts` y el enlace —con la regla de compatibilidad NET-HW-034—
 * en `topology-enlace.ts`. Este módulo reexporta ambas superficies.
 *
 * El esquema SQL guarda entity_id como INTEGER (device.id / category.id); el
 * dominio trabaja con (entityType, entitySlug) y el adaptador traduce, como
 * hace relationship con subject_id.
 */

export { TOPOLOGY_NODE_TYPES, TopologyNode } from './topology-nodo.js'
export type { TopologyNodeProps } from './topology-nodo.js'
export { TopologyEdge, validateLinkCompatibility } from './topology-enlace.js'
export type { TopologyEdgeProps, LinkCompatibilityInput, LinkCompatibilityResult } from './topology-enlace.js'

export type TopologyKind = 'reference' | 'user'

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
    const edges = props.edges.map((e) => TopologyEdge.create(e))
    validarAgregado(props.slug, nodes, edges)

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
    return new Topology({
      slug: this.slug.value,
      name: this.name,
      kind: this.kind,
      nodes: this.nodes.map((n) => conPosicion(n, porNode.get(n.id))),
      edges: this.edges.map((e) => ({ from: e.from, to: e.to, linkKind: e.linkKind, mediumCode: e.mediumCode, label: e.label })),
      metadata: this.metadata,
    })
  }
}

/** Integridad del agregado: ids únicos, aristas sobre nodos existentes y sin duplicados. */
function validarAgregado(slug: string, nodes: readonly TopologyNode[], edges: readonly TopologyEdge[]): void {
  const ids = new Set<string>()
  for (const n of nodes) {
    if (ids.has(n.id)) throw new Error(`Topology "${slug}": id de nodo duplicado "${n.id}".`)
    ids.add(n.id)
  }
  const pares = new Set<string>()
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      throw new Error(`Topology "${slug}": el enlace "${e.id}" referencia un nodo inexistente.`)
    }
    const par = [e.from, e.to].sort().join('|')
    if (pares.has(par)) throw new Error(`Topology "${slug}": enlace duplicado entre "${e.from}" y "${e.to}".`)
    pares.add(par)
  }
}

/** Props de un nodo con la posición aplicada si el layout la trae. */
function conPosicion(n: TopologyNode, pos: { x: number; y: number } | undefined): TopologyNodeProps {
  const ubicado = pos ? n.withPosition(pos.x, pos.y) : n
  return {
    entityType: ubicado.entityType,
    entitySlug: ubicado.entitySlug,
    x: ubicado.x,
    y: ubicado.y,
    layerHint: ubicado.layerHint,
  }
}
