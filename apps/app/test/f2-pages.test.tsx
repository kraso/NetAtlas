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
 * F2 — páginas de fabricante (NET-HW-027), glosario (NET-HW-024),
 * panel frontal (NET-HW-022) y migas/historial (NET-HW-025).
 */
describe('Fabricante → familias → modelos (NET-HW-027)', () => {
  it('la página del fabricante lista sus dispositivos agrupados', async () => {
    renderApp('/fabricante/cisco')
    expect(await screen.findByText('Cisco Systems')).toBeDefined()
    expect(screen.getByText('Cisco Catalyst 9300-48P')).toBeDefined()
    expect(screen.getByText('Cisco Catalyst 9120AXI')).toBeDefined()
  })
})

describe('Glosario + enlaces inline (NET-HW-024)', () => {
  it('el glosario lista términos y permite filtro', async () => {
    renderApp('/glosario')
    expect(await screen.findByText('Conmutador (switch)')).toBeDefined()
    const input = screen.getByLabelText('Filtrar términos') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'VLAN' } })
    expect(screen.getByText('VLAN (802.1Q)')).toBeDefined()
    expect(screen.queryByText('Conmutador (switch)')).toBeNull()
  })

  it('la ficha enlaza términos del glosario inline', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Protocolos' }))
    expect(screen.getByRole('link', { name: 'conmutador' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'VLAN' })).toBeDefined()
  })

  it('el detalle de término resuelve su definición', async () => {
    renderApp('/glosario/vlan')
    expect(await screen.findByText('VLAN (802.1Q)')).toBeDefined()
    expect(screen.getByText(/Segmentación lógica/i)).toBeDefined()
  })

  it('el glosario ampliado incluye términos de Redes y Protocolos', async () => {
    renderApp('/glosario')
    expect(await screen.findByText('Enrutador (router)')).toBeDefined()
    expect(screen.getByText('Cortafuegos (firewall)')).toBeDefined()
    const input = screen.getByLabelText('Filtrar términos') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'qos' } })
    expect(screen.getByText('QoS')).toBeDefined()
    expect(screen.queryByText('Enrutador (router)')).toBeNull()
    renderApp('/glosario/router')
    expect(await screen.findByText(/encamina paquetes entre redes/i)).toBeDefined()
  })
})

describe('Panel frontal SVG (NET-HW-022)', () => {
  it('la ficha muestra el panel frontal del inventario', async () => {
    renderApp('/device/cisco-c9300-48p')
    expect(await screen.findByRole('img', { name: 'Panel frontal: 2 grupos de puertos' })).toBeDefined()
    // Equivalencia textual accesible
    expect(screen.getByLabelText('Puertos del dispositivo')).toBeDefined()
  })
})

describe('Migas + historial (NET-HW-025)', () => {
  it('la ficha muestra migas de navegación', async () => {
    renderApp('/device/cisco-c9300-48p')
    const breadcrumbs = await screen.findByRole('navigation', { name: 'Migas de pan y navegación' })
    expect(breadcrumbs).toBeDefined()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeDefined()
    // Dos enlaces "Explorar" legítimos: nav principal y migas; en migas existe
    expect(screen.getAllByRole('link', { name: 'Explorar' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cisco Catalyst 9300-48P').length).toBeGreaterThanOrEqual(1)
  })

  it('el botón volver existe en la ficha', async () => {
    renderApp('/device/cisco-c9300-48p')
    expect(await screen.findByRole('button', { name: '← Volver' })).toBeDefined()
  })
})