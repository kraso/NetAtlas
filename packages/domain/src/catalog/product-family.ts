import { Slug } from '../value-objects/slug.js'

/** Familia de productos de un fabricante: clave natural (manufacturer, slug). */
export interface ProductFamilyProps {
  readonly manufacturerSlug: string
  readonly slug: string
  readonly name: string
  readonly description?: string | undefined
}

export class ProductFamily {
  readonly manufacturerSlug: string
  readonly slug: Slug
  readonly name: string
  readonly description?: string

  private constructor(props: ProductFamilyProps) {
    if (props.name.trim().length === 0) {
      throw new Error('ProductFamily: name no puede estar vacío.')
    }
    this.manufacturerSlug = Slug.create(props.manufacturerSlug).value
    this.slug = Slug.create(props.slug)
    this.name = props.name
    this.description = props.description
    Object.freeze(this)
  }

  static create(props: ProductFamilyProps): ProductFamily {
    return new ProductFamily(props)
  }

  static hydrate(props: ProductFamilyProps): ProductFamily {
    return new ProductFamily(props)
  }
}