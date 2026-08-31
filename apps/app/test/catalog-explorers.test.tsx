import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'

function renderApp(route: string): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setServices(buildServices())
})

/**
 * Exploradores bidireccionales (NET-HW-023) + calculadora anclada (§16 / CU-14).
 */
describe('Exploradores de catálogos (NET-HW-023)', () => {
  it('el explorador de catálogos lista protocolos desde el catálogo cerrado', async () => {
    renderApp('/catalogos')
    expect(await screen.findByText('6 protocolos del catálogo cerrado (§14).')).toBeDefined()
    expect(screen.getByRole('link', { name: 'ospf' })).toBeDefined()
  })

  it('cambia a la pestaña de estándares', async () => {
    renderApp('/catalogos')
    fireEvent.click(await screen.findByRole('tab', { name: 'Estándares' }))
    expect(await screen.findByRole('link', { name: 'ieee/802.3at' })).toBeDefined()
  })

  it('la ficha de protocolo es bidireccional (dispositivos que lo soportan)', async () => {
    renderApp('/protocolo/ospf')
    // 9300, 6300M y 2930F declaran ospf en el demo
    expect(await screen.findByText('Cisco Catalyst 9300-48P')).toBeDefined()
    expect(screen.getByText('Aruba 6300M 48G')).toBeDefined()
    expect(screen.getByText('Aruba 2930F 48G PoE+')).toBeDefined()
  })

  it('la ficha de medio de fibra ancla la calculadora de enlace (CU-14)', async () => {
    renderApp('/medio/smf-os2')
    // Dispositivos que lo terminan (mikrotik) + calculadora con margen viable
    expect(await screen.findByText('MikroTik CCR1036-8G-2S+')).toBeDefined()
    expect(screen.getByText('Calculadora de enlace (CU-14)')).toBeDefined()
    expect(screen.getByText(/Enlace viable: margen/i)).toBeDefined()
  })
})