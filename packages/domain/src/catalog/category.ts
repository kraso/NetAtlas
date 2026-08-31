import { Slug } from '../value-objects/slug.js'

/**
 * Categoría taxonómica (sección 7 del plan maestro).
 * Las categorías son datos, no código: se añaden como filas, nunca como migraciones.
 * Código estable e inmutable tipo 'CAT-SWT-L3'.
 */
export interface CategoryProps {
  readonly code: string
  readonly parentCode?: string | undefined
  readonly nameEs: string
  readonly nameEn?: string | undefined
  readonly aliases: readonly string[]
  readonly definition?: string | undefined
  readonly sortOrder: number
}

export class Category {
  readonly code: string
  readonly parentCode?: string
  readonly nameEs: string
  readonly nameEn?: string
  readonly aliases: readonly string[]
  readonly definition?: string
  readonly sortOrder: number

  private constructor(props: CategoryProps) {
    if (!/^CAT-[A-Z0-9]+(?:-[A-Z0-9-]+)*$/.test(props.code)) {
      throw new Error(`Código de categoría inválido: "${props.code}". Formato: CAT-XXX[-YYY].`)
    }
    if (props.nameEs.trim().length === 0) {
      throw new Error(`Categoría ${props.code}: name_es no puede estar vacío.`)
    }
    this.code = props.code
    this.parentCode = props.parentCode
    this.nameEs = props.nameEs
    this.nameEn = props.nameEn
    this.aliases = Object.freeze([...props.aliases])
    this.definition = props.definition
    this.sortOrder = props.sortOrder
    Object.freeze(this)
  }

  static create(props: CategoryProps): Category {
    return new Category(props)
  }

  /** Reconstrucción desde persistencia (sin revalidar el código ya persistido). */
  static hydrate(props: CategoryProps): Category {
    return new Category(props)
  }
}

/** Filtro rápido para búsqueda por alias/nombre (auxiliar del dominio). */
export function categoryMatchesAlias(category: Category, term: string): boolean {
  const t = term.trim().toLowerCase()
  return (
    category.code.toLowerCase() === t ||
    category.nameEs.toLowerCase().includes(t) ||
    category.aliases.some((a) => a.toLowerCase().includes(t))
  )
}

/** Slug de utilidad para categorías: 'CAT-SWT' -> 'cat-swt'. */
export function categorySlug(category: Category): Slug {
  return Slug.from(category.code.toLowerCase())
}