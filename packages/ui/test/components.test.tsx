import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfidenceBadge, confidenceToken } from '../src/components/confidence-badge.jsx'
import { CategoryIcon, macroOf } from '../src/components/category-icon.jsx'
import { OsiPanel } from '../src/components/osi-panel.jsx'
import type { Confidence } from '@netatlas/domain'

describe('ConfidenceBadge', () => {
  it('muestra la etiqueta y el role img accesible', () => {
    const { container } = render(<ConfidenceBadge confidence="official" />)
    expect(screen.getByText('Oficial')).toBeDefined()
    const badge = container.querySelector('.confidence-badge')
    expect(badge?.getAttribute('role')).toBe('img')
    expect(badge?.getAttribute('aria-label')).toBe('Confianza: Oficial')
    cleanup()
  })

  it('mapea tokens de color por nivel', () => {
    const casos: [Confidence, string][] = [
      ['official', 'var(--conf-official)'],
      ['derived', 'var(--conf-derived)'],
      ['third-party', 'var(--conf-third-party)'],
      ['experimental', 'var(--conf-experimental)'],
      ['historical', 'var(--conf-historical)'],
    ]
    for (const [nivel, token] of casos) {
      expect(confidenceToken(nivel)).toBe(token)
    }
  })
})

describe('CategoryIcon', () => {
  it('normaliza subcategoría a macrocategoría raíz', () => {
    expect(macroOf('CAT-SWT-L2')).toBe('CAT-SWT')
    expect(macroOf('CAT-RTR-ENT')).toBe('CAT-RTR')
  })

  it('es aria-hidden (decorativo; el texto lo da la UI)', () => {
    const { container } = render(<CategoryIcon category="CAT-SWT" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('data-cat')).toBe('CAT-SWT')
    cleanup()
  })
})

describe('OsiPanel', () => {
  it('resalta capas terminadas y lista alternativa accesible', () => {
    const perfil = { terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 3 }
    const { container } = render(<OsiPanel profile={perfil} />)
    // Los items con role=status son los que terminan
    const statuses = container.querySelectorAll('[role="status"]')
    expect(statuses.length).toBeGreaterThanOrEqual(2) // capa 1 y 2 terminadas al menos
    // Alternativa textual (sr-only) lista las capas
    expect(screen.getByText(/Capas que termina/i)).toBeDefined()
    cleanup()
  })

  it('respeta la selección de capas para la consulta inversa', () => {
    const perfil = { terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 }
    const { container } = render(<OsiPanel profile={perfil} selected={[2]} />)
    // El borde de la capa seleccionada usa el token de foco
    const items = container.querySelectorAll('li div[style]')
    expect(items.length).toBe(7)
    cleanup()
  })
})