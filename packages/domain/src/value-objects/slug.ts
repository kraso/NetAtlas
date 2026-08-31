/**
 * Value object: Slug.
 * Identificador estable e inmutable usable en URLs y datasets externos.
 * Formato: minúsculas, dígitos y guiones; sin espacios ni caracteres acentuados.
 */
export class Slug {
  private constructor(readonly value: string) {
    Object.freeze(this)
  }

  static readonly PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

  static create(input: string): Slug {
    const normalized = input.trim().toLowerCase().replace(/\s+/g, '-')
    if (!Slug.PATTERN.test(normalized)) {
      throw new Error(
        `Slug inválido: "${input}". Use minúsculas, dígitos y guiones (p. ej. "aruba-2930f-48g-poeplus").`,
      )
    }
    return new Slug(normalized)
  }

  static from(value: string): Slug {
    return new Slug(value)
  }

  toString(): string {
    return this.value
  }

  equals(other: Slug): boolean {
    return this.value === other.value
  }
}