import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'
import { cyMockState as cyMock } from './cy-mock.js'

function renderApp(initialRoute = '/'): void {
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setServices(buildServices())
  cyMock.reset()
})

/** Obtiene los elementos que el mock de Cytoscape recibió en la última llamada. */
function ultimosElementos(): { data: Record<string, string> }[] {
  const llamada = cyMock.calls.at(-1) as [{ elements: { data: Record<string, string> }[] }] | undefined
  return llamada?.[0]?.elements ?? []
}

/**
 * F3 — NET-HW-030: mapa local del grafo con Cytoscape.js en la pestaña
 * Diagramas, con filtros por predicado.
 */
describe('Mapa local del grafo (NET-HW-030)', () => {
  it('renderiza el subgrafo local del dispositivo en Cytoscape', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Diagramas' }))

    await waitFor(() => expect(cyMock.calls.length).toBeGreaterThan(0))
    const elements = ultimosElementos()
    // Nodo central + fabricante + categoría + protocolos
    expect(elements.some((e) => e.data.id === 'device:cisco-c9300-48p')).toBe(true)
    expect(elements.some((e) => e.data.id === 'manufacturer:cisco')).toBe(true)
    expect(elements.some((e) => e.data.source && e.data.predicate === 'supports-protocol')).toBe(true)
  })

  it('expone los filtros por predicado y el subgrafo cambia al activarlos', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Diagramas' }))

    const check = await screen.findByRole('checkbox', { name: /Soporta protocolo/i })
    check.click()

    await waitFor(() => {
      const elements = ultimosElementos()
      const aristas = elements.filter((e) => e.data.source !== undefined && e.data.target !== undefined)
      expect(aristas.length).toBeGreaterThan(0)
      expect(aristas.every((e) => e.data.predicate === 'supports-protocol')).toBe(true)
    })
    // El botón para restablecer aparece
    expect(screen.getByRole('button', { name: /Mostrar todas las relaciones/i })).toBeDefined()
  })

  it('muestra el conteo de nodos y aristas', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Diagramas' }))
    expect(await screen.findByText(/\d+ nodos · \d+ aristas/)).toBeDefined()
  })

  it('dispositivo sin relaciones muestra empty-state curado', async () => {
    // Sin aristas en el dataset → el mapa local muestra el empty-state.
    const services = buildServices()
    setServices(buildServices({ ...services.dataset, relationships: [] }))
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Diagramas' }))
    expect(await screen.findByText(/sin relaciones curadas para el mapa local/i)).toBeDefined()
  })
})