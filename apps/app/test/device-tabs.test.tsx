import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
 * Ficha — 13 pestañas (§10.5).
 * Verifica que todas existen, que las alimentadas por el grafo muestran
 * contenido (Protocolos, Estándares, Historia, Referencias) y que las
 * pendientes muestran empty-state curado (Arquitectura, Diagramas…).
 */
describe('Ficha de dispositivo — 13 pestañas (§10.5)', () => {
  const PESTAÑAS = [
    'Resumen', 'Especificaciones', 'Interfaces', 'Protocolos', 'Capacidades',
    'Arquitectura', 'Capas OSI', 'Estándares', 'Compatibilidad', 'Diagramas',
    'Historia', 'Documentación', 'Referencias',
  ]

  it('expone las 13 pestañas en el tablist', async () => {
    renderApp('/device/cisco-c9300-48p')
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.length).toBe(13)
    for (const label of PESTAÑAS) {
      expect(screen.getByRole('tab', { name: label })).toBeDefined()
    }
  })

  it('Protocolos: muestra los soportes del grafo (por edoción)', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Protocolos' }))
    // El demo declara ospf, bgp y vxlan para el 9300 (aparecen en pestaña y panel contextual)
    expect((await screen.findAllByRole('link', { name: 'ospf' })).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'bgp' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'vxlan' }).length).toBeGreaterThanOrEqual(1)
  })

  it('Historia: muestra el árbol evolutivo con el antecesor', async () => {
    renderApp('/device/aruba-6300m-48g')
    fireEvent.click(await screen.findByRole('tab', { name: 'Historia' }))
    expect(await screen.findByRole('heading', { name: 'Antecesores' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'aruba-2930f-48g' })).toBeDefined()
  })

  it('Referencias: assertion con fuente y confianza', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Referencias' }))
    // throughput_gbps official del demo
    expect(await screen.findByText('throughput_gbps')).toBeDefined()
    expect(screen.getAllByText('Oficial').length).toBeGreaterThanOrEqual(1)
  })

  it('pestañas pendientes muestran empty-state curado (sin inventar)', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Arquitectura' }))
    expect(await screen.findByText(/pendiente/i)).toBeDefined()
  })

  it('Arquitectura curada: el FortiGate 200F del demo muestra CPU/SoC/CP/NP/almacenamiento con fuente', async () => {
    renderApp('/device/fortinet-200f')
    fireEvent.click(await screen.findByRole('tab', { name: 'Arquitectura' }))
    // Datos curados del datasheet oficial de Fortinet.
    expect(await screen.findByText(/Intel Xeon D-1627/)).toBeDefined()
    expect(screen.getAllByText(/NP6XLite/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/CP9/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/480 GB/)).toBeDefined()
    // Fuente y confianza oficial.
    expect(screen.getByText(/FortiGate 200F Series Data Sheet/)).toBeDefined()
    expect(screen.getAllByText('Oficial').length).toBeGreaterThanOrEqual(1)
  })
})

describe('Protocolo bidireccional (§10.7)', () => {
  it('la ficha de protocolo lista los dispositivos que lo soportan', async () => {
    renderApp('/protocolo/ospf')
    // 9300 y 6300M y 2930F declaran ospf
    expect(await screen.findByText('Cisco Catalyst 9300-48P')).toBeDefined()
  })
})