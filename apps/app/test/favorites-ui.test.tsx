import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, useServices } from '../src/composition-root.js'

/**
 * F8B — favoritos (NET-HW-064): la ficha marca/desmarca y persiste en
 * localStorage con el formato `tipo:slug` del dominio (sincronizable con
 * /v1/favorites). Local-first: sin red sigue funcionando (§23.4).
 */
function renderFicha(slug = 'cisco-c9300-48p'): void {
  render(
    <MemoryRouter initialEntries={[`/device/${slug}`]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setServices(useServices.getState().services)
  localStorage.removeItem('netatlas.favorites.v1')
  cleanup()
})

describe('Favoritos de usuario (F8B, NET-HW-064)', () => {
  it('la ficha muestra el botón y añade/quita el favorito', async () => {
    renderFicha()
    const btn = await screen.findByTestId('favorito-cisco-c9300-48p')
    expect(btn.textContent).toContain('☆')

    fireEvent.click(btn)
    await waitFor(() => expect(btn.textContent).toContain('★'))
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    // Persistido en localStorage con el formato dominio tipo:slug.
    const guardado = JSON.parse(localStorage.getItem('netatlas.favorites.v1') ?? '[]') as { entidad: string }[]
    expect(guardado[0]?.entidad).toBe('device:cisco-c9300-48p')

    fireEvent.click(btn)
    await waitFor(() => expect(btn.textContent).toContain('☆'))
    expect(localStorage.getItem('netatlas.favorites.v1')).toBe('[]')
  })

  it('el favorito sobrevive a una recarga (persistencia local)', async () => {
    localStorage.setItem(
      'netatlas.favorites.v1',
      JSON.stringify([{ entidad: 'device:cisco-c9300-48p', createdAt: '2025-01-01T00:00:00.000Z' }]),
    )
    renderFicha()
    const btn = await screen.findByTestId('favorito-cisco-c9300-48p')
    expect(btn.textContent).toContain('★')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })
})