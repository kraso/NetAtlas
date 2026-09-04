import { Slug } from '../value-objects/slug.js'

/** Fabricante / marca (sección 8.1 del plan maestro). */
export interface ManufacturerProps {
  readonly slug: string
  readonly name: string
  readonly country?: string | undefined
  readonly foundedYear?: number | undefined
  readonly website?: string | undefined
  readonly status?: 'active' | 'inactive' | 'acquired' | 'defunct' | undefined
  /** Número de empresa SMI para SNMP (sysObjectID base 1.3.6.1.4.1.N). */
  readonly snmpEnterprise?: number | undefined
}

export class Manufacturer {
  readonly slug: Slug
  readonly name: string
  readonly country?: string
  readonly foundedYear?: number
  readonly website?: string
  readonly status: 'active' | 'inactive' | 'acquired' | 'defunct'
  readonly snmpEnterprise?: number

  private constructor(props: ManufacturerProps) {
    if (props.name.trim().length === 0) {
      throw new Error('Manufacturer: name no puede estar vacío.')
    }
    if (props.foundedYear !== undefined && (props.foundedYear < 1800 || props.foundedYear > 2100)) {
      throw new Error(`Manufacturer: founded_year fuera de rango: ${props.foundedYear}.`)
    }
    if (props.snmpEnterprise !== undefined && (!Number.isInteger(props.snmpEnterprise) || props.snmpEnterprise <= 0)) {
      throw new Error(`Manufacturer: snmp_enterprise debe ser entero positivo: ${props.snmpEnterprise}.`)
    }
    this.slug = Slug.create(props.slug)
    this.name = props.name
    this.country = props.country
    this.foundedYear = props.foundedYear
    this.website = props.website
    this.status = props.status ?? 'active'
    this.snmpEnterprise = props.snmpEnterprise
    Object.freeze(this)
  }

  static create(props: ManufacturerProps): Manufacturer {
    return new Manufacturer(props)
  }

  static hydrate(props: ManufacturerProps): Manufacturer {
    return new Manufacturer(props)
  }
}