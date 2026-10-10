import React from 'react'
import { CategoryIcon } from '@netatlas/ui'
import type { Category } from '@netatlas/domain'
import { rootCategories, childrenOf } from '../viewmodels/catalog-store.js'

/**
 * Árbol jerárquico de categorías del explorador (§10.4): raíces anidadas
 * con selección por `cat` en la URL.
 */
export function ArbolCategorias({
  categories,
  seleccionada,
  onSelect,
}: {
  categories: readonly Category[]
  seleccionada: string | null
  onSelect: (code: string) => void
}): React.JSX.Element {
  const tree = (parent?: string): React.JSX.Element[] => {
    const items = parent === undefined ? rootCategories(categories) : childrenOf(categories, parent)
    return items.map((cat) => (
      <li key={cat.code}>
        <button
          type="button"
          onClick={() => onSelect(cat.code)}
          aria-pressed={seleccionada === cat.code}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 0' }}
        >
          <CategoryIcon category={cat.code} size={16} />
          <span>{cat.nameEs}</span>
        </button>
        {childrenOf(categories, cat.code).length > 0 ? <ul style={{ paddingLeft: 18 }}>{tree(cat.code)}</ul> : null}
      </li>
    ))
  }

  return (
    <nav aria-label="Árbol de categorías">
      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Categorías</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{tree()}</ul>
    </nav>
  )
}
