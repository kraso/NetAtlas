import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'

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

/**
 * F3 — NET-HW-031 (genealogía evolves-into + árbol tecnológico) y
 * NET-HW-032 (similar-to curado + «comparar desde aquí»).
 */
describe('Genealogía y árbol tecnológico (NET-HW-031)', () => {
  it('muestra el árbol evolutivo de dispositivos (antecesores y sucesores)', async () => {
    renderApp('/device/aruba-6300m-48g')
    fireEvent.click(await screen.findByRole('tab', { name: 'Historia' }))
    expect(await screen.findByRole('heading', { name: 'Árbol evolutivo de dispositivos' })).toBeDefined()
    // 2930F es antecesor del 6300M
    expect(screen.getByRole('link', { name: 'aruba-2930f-48g' })).toBeDefined()
  })

  it('muestra la cadena de evolución de tecnologías (evolves-into)', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Historia' }))
    expect(await screen.findByRole('heading', { name: 'Evolución de tecnologías' })).toBeDefined()
    // Cadena curada en el demo: 802.3af → 802.3at → 802.3bt (los eslabones i>0 llevan ' → ' por delante)
    const eslabones = await screen.findAllByText(/poe-8023(af|at|bt)/)
    expect(eslabones.length).toBeGreaterThanOrEqual(3)
    await screen.findByText(/poe-8023af/)
    await screen.findByText(/poe-8023bt/)
  })

  it('dispositivo sin genealogía muestra empty-state curado', async () => {
    renderApp('/device/mikrotik-ccr1036')
    fireEvent.click(await screen.findByRole('tab', { name: 'Historia' }))
    expect(await screen.findByText(/genealogía \(succeeds\/precedes\/replaced-by, evolves-into\) pendiente/i)).toBeDefined()
  })
})

describe('Similares y comparar desde aquí (NET-HW-032)', () => {
  it('listas de similar-to con el puente al comparador', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Compatibilidad' }))
    expect(await screen.findByRole('heading', { name: 'Similares curados (1)' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'aruba-6300m-48g' })).toBeDefined()
    expect(screen.getByRole('link', { name: /Comparar cisco-c9300-48p con aruba-6300m-48g/i })).toBeDefined()
  })

  it('«comparar desde aquí» navega a la ruta /comparar con ambos contendientes', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Compatibilidad' }))
    const enlace = await screen.findByRole('link', { name: /Comparar cisco-c9300-48p con aruba-6300m-48g/i })
    fireEvent.click(enlace)
    expect(await screen.findByRole('heading', { name: 'Comparación de dispositivos' })).toBeDefined()
    // Ambos nombres de dispositivo aparecen en la tabla del puente
    await screen.findByText('Cisco Catalyst 9300-48P')
    expect(screen.getByText('Aruba 6300M 48G')).toBeDefined()
  })

  it('el comparador sin contendientes muestra el mensaje de ayuda', async () => {
    renderApp('/comparar')
    expect(await screen.findByText(/el comparador necesita dos dispositivos/i)).toBeDefined()
  })
})