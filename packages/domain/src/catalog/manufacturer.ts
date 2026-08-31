import { Slug } from '../value-objects/slug.js'

/** Fabricante / marca (sección 8.1 del plan maestro). */
export interface ManufacturerProps {
  readonly slug: string
  readonly name: string
  readonly country?: string | undefined
  readonly foundedYear?: number | undefined
  readonly website?: string | undefined
  readonly status?: 'active' | 'inactive' | 'acquired' | 'defunct' | undefined
}

export class Manufacturer {
  readonly slug: Slug
  readonly name: string
  readonly country?: string
  readonly foundedYear?: number
  readonly website?: string
  readonly status: 'active' | 'inactive' | 'acquired' | 'defunct'

  private constructor(props: ManufacturerProps) {
    if (props.name.trim().length === 0) {
      throw new Error('Manufacturer: name no puede estar vacío.')
    }
    if (props.foundedYear !== undefined && (props.foundedYear < 1800 || props.foundedYear > 2100)) {
      throw new Error(`Manufacturer: founded_year fuera de rango: ${props.foundedYear}.`)
    }
    this.slug = Slug.create(props.slug)
    this.name = props.name
    this.country = props.country
    this.foundedYear = props.foundedYear
    this.website = props.website
    this.status = props.status ?? 'active'
    Object.freeze(this)
  }

  static create(props: ManufacturerProps): Manufacturer {
    return new Manufacturer(props)
  }

  static hydrate(props: ManufacturerProps): Manufacturer {
    return new Manufacturer(props)
  }
}