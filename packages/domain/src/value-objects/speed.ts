/**
 * Value object: Speed (velocidad de datos).
 * Unidad canónica: Mbps (megabits por segundo).
 * Todos los valores entran en Mbps; la comparación nunca usa textos.
 */
export class Speed {
  private constructor(readonly mbps: number) {
    Object.freeze(this)
  }

  static create(mbps: number): Speed {
    if (!Number.isFinite(mbps) || mbps < 0) {
      throw new Error(`Velocidad inválida: ${mbps} Mbps. Debe ser un número ≥ 0.`)
    }
    return new Speed(mbps)
  }

  static gbps(gbps: number): Speed {
    return Speed.create(gbps * 1000)
  }

  static fromMbps(mbps: number): Speed {
    return Speed.create(mbps)
  }

  toMbps(): number {
    return this.mbps
  }

  toGbps(): number {
    return this.mbps / 1000
  }

  /** Comparación segura contra otra velocidad (misma unidad canónica). */
  compare(other: Speed): number {
    return this.mbps - other.mbps
  }

  equals(other: Speed): boolean {
    return this.mbps === other.mbps
  }

  toString(): string {
    return this.mbps >= 1000 ? `${this.toGbps()} Gbps` : `${this.mbps} Mbps`
  }
}