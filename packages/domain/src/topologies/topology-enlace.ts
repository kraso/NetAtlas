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
  if (input.curatedCompatible) return { ok: true }
  if (input.fromSpeeds.some((s) => input.toSpeeds.includes(s))) return { ok: true }
  return {
    ok: false,
    reason: `Sin interfaz común (origen: ${input.fromSpeeds.join('/') || '—'} Mbps · destino: ${input.toSpeeds.join('/') || '—'} Mbps) ni compatibilidad curada.`,
  }
}
