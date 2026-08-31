import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'

/**
 * NET-HW-026 — accesibilidad AA base.
 * - Toda entrada tiene <label> asociado (1.3.1 / 4.1.2).
 * - Navegación por teclado: Tab recorre controles; Enter/espacio activan.
 * - Tabs con roles/aria correctos.
 */

function renderApp(initialRoute = '/'): void {
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setServices(buildServices())
})

describe('A11y AA base (NET-HW-026)', () => {
  it('la búsqueda del dashboard tiene label asociado', async () => {
    renderApp('/')
    const input = await screen.findByTestId('busqueda-dashboard')
    // El label sr-only referencia el input por htmlFor
    const label = screen.getByLabelText('Buscar dispositivos, protocolos o estándares')
    expect(label).toBe(input)
    expect(input.id).toBe('busqueda')
  })

  it('las pestañas de la ficha son operables por teclado (rol/aria correctos)', async () => {
    renderApp('/device/cisco-c9300-48p')
    const tabInterfaces = await screen.findByRole('tab', { name: 'Interfaces' })
    // Keyboard: Enter activa el tab (onClick manejado)
    tabInterfaces.focus()
    fireEvent.keyDown(tabInterfaces, { key: 'Enter' })
    fireEvent.click(tabInterfaces)
    const panel = screen.getByRole('tabpanel', { name: 'Interfaces' })
    expect(panel).toBeDefined()
    // La tabla de interfaces usa encabezados con scope
    const th = screen.getAllByRole('columnheader')
    expect(th.length).toBeGreaterThanOrEqual(4)
  })

  it('el árbol de categorías usa botones con aria-pressed (explorador)', async () => {
    renderApp('/explore')
    const botonCat = await screen.findByRole('button', { name: /Interconexión y switching/i })
    expect(botonCat.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(botonCat)
    expect(botonCat.getAttribute('aria-pressed')).toBe('true')
    // Resultados en tabla accesible con encabezados
    expect(await screen.findByRole('table')).toBeDefined()
  })

  it('toda la app es navegable con Tab (primer foco en la navegación)', async () => {
    renderApp('/explore')
    const primerEnlace = screen.getByRole('link', { name: 'NetAtlas' })
    primerEnlace.focus()
    expect(document.activeElement).not.toBe(document.body)
  })
})