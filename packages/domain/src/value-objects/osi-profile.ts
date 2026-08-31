/** Perfil de capas OSI de una entidad (sección 8.4 del plan maestro). */
export interface OsiProfile {
  /** Capas que el dispositivo termina/procesa conscientemente (p. ej. switch L2 → [1, 2]). */
  readonly terminate: readonly number[]
  /** Capas que atraviesan el dispositivo sin que él las interprete. */
  readonly transparent: readonly number[]
  /** Capa que lo define (router = 3). */
  readonly primary: number
}

const LAYER_RANGE = [1, 2, 3, 4, 5, 6, 7] as const
export type OsiLayerNumber = (typeof LAYER_RANGE)[number]

export class OsiProfileValue {
  private constructor(readonly profile: OsiProfile) {
    Object.freeze(this)
  }

  static create(profile: OsiProfile): OsiProfileValue {
    const { terminate, transparent, primary } = profile
    if (!LAYER_RANGE.includes(primary as OsiLayerNumber)) {
      throw new Error(`Capa primaria inválida: ${primary}. Debe estar entre 1 y 7.`)
    }
    for (const l of [...terminate, ...transparent]) {
      if (!LAYER_RANGE.includes(l as OsiLayerNumber)) {
        throw new Error(`Capa fuera de rango (1–7): ${l}`)
      }
    }
    if (terminate.includes(primary) === false) {
      // La capa primaria siempre termina.
      throw new Error('La capa primaria debe pertenecer a terminate.')
    }
    return new OsiProfileValue({
      terminate: Object.freeze([...terminate]),
      transparent: Object.freeze([...transparent]),
      primary,
    })
  }

  /** Mapeo OSI → TCP/IP (sección 8.4.1: acceso-red ↔ {1,2}, Internet ↔ {3}, transporte ↔ {4}, aplicación ↔ {5–7}). */
  toTcpIpLayers(): readonly number[] {
    const tcp = new Set<number>()
    for (const l of this.profile.terminate) {
      if (l <= 2) tcp.add(1)
      else if (l === 3) tcp.add(2)
      else if (l === 4) tcp.add(3)
      else tcp.add(4)
    }
    return Object.freeze([...tcp].sort())
  }

  /** ¿Termina al menos una de las capas seleccionadas? (consulta inversa "qué dispositivos operan aquí"). */
  terminatesAny(layers: readonly number[]): boolean {
    return layers.some((l) => this.profile.terminate.includes(l))
  }

  toString(): string {
    return `OSI{termina:[${this.profile.terminate}], primaria:${this.profile.primary}}`
  }
}