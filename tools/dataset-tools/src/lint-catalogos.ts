import type { Push, SeedCatalogs, SeedCategory } from './lint-tipos.js'

/**
 * Regla 1 de data:lint (PLAN MAESTRO §8.6-1): catálogos cerrados con código y
 * árbol de categorías sin huérfanos.
 */

/** Códigos de catálogo obligatorios: protocolo, medio y estándar. */
export function validarCodigosDeCatalogo(input: SeedCatalogs, push: Push): void {
  for (const p of input.protocols) {
    if (!p.code || p.code.trim() === '') push('error', 'protocol-code', 'Protocolo sin código.')
  }
  for (const m of input.media) {
    if (!m.code || m.code.trim() === '') push('error', 'medium-code', 'Medio sin código.')
  }
  for (const s of input.standards) {
    if (!s.org || !s.identifier) push('error', 'standard-code', `Estándar incompleto: ${s.title ?? '(sin título)'}.`)
  }
}

/** 1. Categorías huérfanas: todo parentCode debe existir. */
export function validarCategorias(categories: readonly SeedCategory[], push: Push): void {
  const categoryCodes = new Set(categories.map((c) => c.code))
  for (const category of categories) {
    if (category.parentCode !== undefined && !categoryCodes.has(category.parentCode)) {
      push('error', 'category-orphan', `Categoría "${category.code}" referencia padre inexistente "${category.parentCode}".`)
    }
  }
}

/** Las comprobaciones de catálogo, en el orden histórico de data:lint. */
export function validarCatalogos(input: SeedCatalogs, push: Push): void {
  validarCodigosDeCatalogo(input, push)
  validarCategorias(input.categories, push)
}
