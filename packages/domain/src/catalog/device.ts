import { Slug } from '../value-objects/slug.js'
import { OsiProfileValue } from '../value-objects/osi-profile.js'
import { requireLifecycleStatus } from '../value-objects/lifecycle.js'
import type { LifecycleStatus } from '../value-objects/lifecycle.js'

/** Inventario de puertos (sección 8.2.4): una instancia concreta de interfaz en un dispositivo. */
export interface PortProps {
  readonly label: string
  readonly interfaceCode: string
  readonly quantity: number
  readonly speedsMbps: readonly number[]
  readonly poeStandard?: '802.3af' | '802.3at' | '802.3bt' | undefined
  readonly role?: 'access' | 'uplink' | 'mgmt' | 'console' | 'stack' | undefined
  readonly notes?: string | undefined
}

export class Port {
  readonly label: string
  readonly interfaceCode: string
  readonly quantity: number
  readonly speedsMbps: readonly number[]
  readonly poeStandard?: '802.3af' | '802.3at' | '802.3bt'
  readonly role?: 'access' | 'uplink' | 'mgmt' | 'console' | 'stack'
  readonly notes?: string

  private constructor(props: PortProps) {
    if (props.label.trim().length === 0) {
      throw new Error('Port: label no puede estar vacío.')
    }
    if (!Number.isInteger(props.quantity) || props.quantity < 1) {
      throw new Error(`Port "${props.label}": quantity debe ser entero ≥ 1.`)
    }
    for (const s of props.speedsMbps) {
      if (!Number.isFinite(s) || s <= 0) {
        throw new Error(`Port "${props.label}": velocidad inválida ${s}.`)
      }
    }
    this.label = props.label
    this.interfaceCode = props.interfaceCode
    this.quantity = props.quantity
    this.speedsMbps = Object.freeze([...props.speedsMbps])
    this.poeStandard = props.poeStandard
    this.role = props.role
    this.notes = props.notes
    Object.freeze(this)
  }

  static create(props: PortProps): Port {
    return new Port(props)
  }

  /** ¿El puerto es PoE-capable? */
  get supportsPoe(): boolean {
    return this.poeStandard !== undefined
  }
}

/**
 * Dispositivo (sección 8.2 del plan maestro).
 * Entidad raíz del catálogo: identificación + función + inventario + características.
 * En Fase 0 se modela el núcleo; las dimensiones ampliadas viven como
 * atributos por categoría (EAV) y relaciones (grafo).
 */
export interface DeviceProps {
  readonly slug: string
  readonly name: string
  readonly commercialName?: string | undefined
  readonly manufacturerSlug: string
  readonly familySlug?: string | undefined
  readonly categoryCode: string
  readonly secondaryCategoryCodes?: readonly string[] | undefined
  readonly model?: string | undefined
  readonly sku?: string | undefined
  readonly aliases?: readonly string[] | undefined
  readonly announcedOn?: string | undefined
  readonly releasedOn?: string | undefined
  readonly eolOn?: string | undefined
  readonly eosOn?: string | undefined
  readonly lifecycleStatus: LifecycleStatus
  readonly osiProfile?: OsiProfileValue | undefined
  readonly summary?: string | undefined
  readonly ports?: readonly Port[] | undefined
}

export class Device {
  readonly slug: Slug
  readonly name: string
  readonly commercialName?: string
  readonly manufacturerSlug: string
  readonly familySlug?: string
  readonly categoryCode: string
  readonly secondaryCategoryCodes: readonly string[]
  readonly model?: string
  readonly sku?: string
  readonly aliases: readonly string[]
  readonly announcedOn?: string
  readonly releasedOn?: string
  readonly eolOn?: string
  readonly eosOn?: string
  readonly lifecycleStatus: LifecycleStatus
  readonly osiProfile?: OsiProfileValue
  readonly summary?: string
  readonly ports: readonly Port[]

  private constructor(props: DeviceProps) {
    if (props.name.trim().length === 0) {
      throw new Error('Device: name no puede estar vacío.')
    }
    requireLifecycleStatus(props.lifecycleStatus)
    this.slug = Slug.create(props.slug)
    this.name = props.name
    this.commercialName = props.commercialName
    this.manufacturerSlug = Slug.create(props.manufacturerSlug).value
    this.familySlug = props.familySlug
    this.categoryCode = props.categoryCode
    this.secondaryCategoryCodes = Object.freeze([...(props.secondaryCategoryCodes ?? [])])
    this.model = props.model
    this.sku = props.sku
    this.aliases = Object.freeze([...(props.aliases ?? [])])
    this.announcedOn = props.announcedOn
    this.releasedOn = props.releasedOn
    this.eolOn = props.eolOn
    this.eosOn = props.eosOn
    this.lifecycleStatus = props.lifecycleStatus
    this.osiProfile = props.osiProfile
    this.summary = props.summary
    this.ports = Object.freeze([...(props.ports ?? [])])
    Object.freeze(this)
  }

  static create(props: DeviceProps): Device {
    return new Device(props)
  }

  static hydrate(props: DeviceProps): Device {
    return new Device(props)
  }

  /** Número total de puertos del tipo dado (consulta usada por el buscador: "puertos:48"). */
  portCount(interfaceKind?: string): number {
    if (interfaceKind === undefined) {
      return this.ports.reduce((sum, p) => sum + p.quantity, 0)
    }
    return this.ports
      .filter((p) => p.interfaceCode.startsWith(interfaceKind))
      .reduce((sum, p) => sum + p.quantity, 0)
  }
}