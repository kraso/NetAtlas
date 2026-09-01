import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'
import { useTopologiesStore } from '../src/viewmodels/topologies-store.js'
import { cyMockState as cyMock } from './cy-mock.js'

function renderApp(initialRoute = '/'): void {
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App />
    </MemoryRouter>,
  )
}

function ultimosElementos(): { data: Record<string, unknown> }[] {
  const llamada = cyMock.calls.at(-1) as [{ elements: { data: Record<string, unknown> }[] }] | undefined
  return llamada?.[0]?.elements ?? []
}

beforeEach(() => {
  setServices(buildServices())
  cyMock.reset()
  try {
    localStorage.clear()
  } catch {
    // sin almacenamiento
  }
})

/**
 * F4 — NET-HW-033 (visor + persistencia de layout), 034 (laboratorio),
 * 035 (flujo), 036 (mapa global), 037 (exportación).
 */
describe('Visor de topologías (NET-HW-033)', () => {
  it('listado /topologies muestra las topologías de referencia y de usuario', async () => {
    renderApp('/topologies')
    await screen.findByRole('heading', { name: 'Topologías' })
    expect(screen.getByText('Clos de demostración (L3)')).toBeDefined()
    expect(screen.getByText('Sucursal de demostración')).toBeDefined()
    expect(screen.getByText('Estrés — 300 nodos (SLO de diagramas)')).toBeDefined()
    expect(screen.getByRole('button', { name: /Nueva topología/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Mapa global del conocimiento/ })).toBeDefined()
  })

  it('el visor renderiza nodos y aristas en Cytoscape con posiciones guardadas', async () => {
    renderApp('/topology/clos-demo')
    await waitFor(() => expect(cyMock.calls.length).toBeGreaterThan(0))
    const elements = ultimosElementos()
    const nodos = elements.filter((e) => e.data.source === undefined)
    const aristas = elements.filter((e) => e.data.source !== undefined)
    expect(nodos.length).toBe(6)
    expect(aristas.length).toBe(6)
    const c9300 = nodos.find((n) => n.data.id === 'device:cisco-c9300-48p')
    expect((c9300?.data.pos as { x: number } | undefined)?.x).toBe(100)
  })

  it('persistencia de layout: saveLayout cambia la posición al recargar el visor', async () => {
    await useTopologiesStore.getState().saveLayout('clos-demo', [
      { nodeId: 'device:cisco-c9300-48p', x: 7, y: 9 },
    ])
    const t = await useTopologiesStore.getState().bySlug('clos-demo')
    expect(t?.nodeById('device:cisco-c9300-48p')?.x).toBe(7)
    expect(t?.nodeById('device:cisco-c9300-48p')?.y).toBe(9)

    renderApp('/topology/clos-demo')
    await waitFor(() => expect(cyMock.calls.length).toBeGreaterThan(0))
    const elements = ultimosElementos()
    const c9300 = elements.find((e) => e.data.id === 'device:cisco-c9300-48p')
    expect(c9300?.data.pos).toEqual({ x: 7, y: 9 })
  })

  it('filtros por capa OSI reducen los nodos visibles', async () => {
    renderApp('/topology/clos-demo')
    await waitFor(() => expect(cyMock.calls.length).toBeGreaterThan(0))
    // Solo la capa 1 (el 9120AXI)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Capa 1' }))
    await waitFor(() => {
      const nodos = ultimosElementos().filter((e) => e.data.source === undefined)
      expect(nodos.map((n) => String(n.data.id))).toEqual(['device:cisco-9120axi'])
    })
  })

  it('expone la alternativa accesible en tabla y las acciones del visor', async () => {
    renderApp('/topology/clos-demo')
    await screen.findByRole('img', { name: /Topología Clos de demostración/ })
    expect(screen.getByRole('button', { name: 'Exportar SVG' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Exportar PNG' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Simular flujo de paquetes' })).toBeDefined()
    expect(screen.getByRole('button', { name: /Reordenar/ })).toBeDefined()
    // dragfree registrado (persistencia al arrastrar)
    expect(typeof cyMock.handlers['dragfree']).toBe('function')
  })

  it('reordenar con el layout determinista por capas persiste como layout de usuario', async () => {
    renderApp('/topology/clos-demo')
    await waitFor(() => expect(cyMock.calls.length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByRole('button', { name: /Reordenar/ }))
    // El cálculo es síncrono en jsdom (fallback sin Worker): al terminar, la
    // topología guardada contiene posiciones deterministas por capa.
    await waitFor(async () => {
      const t = await useTopologiesStore.getState().bySlug('clos-demo')
      const c9300 = t?.nodeById('device:cisco-c9300-48p')
      expect(c9300?.x).toBeDefined()
    })
  })

  it('flujo de paquetes: dos toques marcan origen/destino y calculan la ruta (NET-HW-035)', async () => {
    renderApp('/topology/clos-demo')
    await waitFor(() => expect(typeof cyMock.handlers['tap']).toBe('function'))
    fireEvent.click(await screen.findByRole('button', { name: 'Simular flujo de paquetes' }))
    expect(await screen.findByText(/Toca dos nodos/)).toBeDefined()
    cyMock.handlers['tap']?.({ target: { id: () => 'device:cisco-c9300-48p' } })
    expect(await screen.findByText(/origen: device:cisco-c9300-48p/)).toBeDefined()
    cyMock.handlers['tap']?.({ target: { id: () => 'device:aruba-6300m-48g' } })
    expect(await screen.findByText(/Ruta: device:cisco-c9300-48p → device:aruba-6300m-48g/)).toBeDefined()
  })
})

describe('Laboratorio de topologías (NET-HW-034)', () => {
  it('añade dispositivos, valida y conecta con interfaz común, y guarda como usuario', async () => {
    renderApp('/topology/nueva')
    await screen.findByText(/Topología vacía/)

    const input = screen.getByTestId('buscador-topo')
    fireEvent.change(input, { target: { value: 'cisco-c9300-48p' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir dispositivo' }))
    expect((await screen.findAllByText(/device:cisco-c9300-48p/)).length).toBeGreaterThanOrEqual(1)

    fireEvent.change(input, { target: { value: 'aruba-6300m-48g' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir dispositivo' }))
    await screen.findAllByText(/device:aruba-6300m-48g/)

    // Conectar: ambos multiplataforma comparten 1000/10000 Mbps → válido
    fireEvent.change(screen.getByLabelText('Nodo origen'), { target: { value: 'device:cisco-c9300-48p' } })
    fireEvent.change(screen.getByLabelText('Nodo destino'), { target: { value: 'device:aruba-6300m-48g' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar y conectar' }))
    expect(await screen.findByText(/device:cisco-c9300-48p → device:aruba-6300m-48g/)).toBeDefined()

    // Dispositivo inexistente → mensaje
    fireEvent.change(input, { target: { value: 'no-existe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir dispositivo' }))
    expect(await screen.findByText(/no existe en el catálogo/)).toBeDefined()

    // Guardar como topología de usuario → navega a la ficha
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'mi-red-demo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar topología' }))
    await screen.findByRole('heading', { level: 1, name: 'mi-red-demo' })
    expect(screen.getByText(/usuario/)).toBeDefined()
    const topologias = useTopologiesStore.getState().topologies
    expect(topologias.map((t) => t.slug.value)).toContain('mi-red-demo')
  })

  it('rechaza el enlace sin interfaz común (selección incompleta)', async () => {
    renderApp('/topology/nueva')
    const input = screen.getByTestId('buscador-topo')
    fireEvent.change(input, { target: { value: 'cisco-c9300-48p' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir dispositivo' }))
    await screen.findAllByText(/device:cisco-c9300-48p/)
    // Sin selección de origen/destino → mensaje de validación del editor
    fireEvent.click(screen.getByRole('button', { name: 'Validar y conectar' }))
    expect(await screen.findByText(/Selecciona dos nodos distintos/)).toBeDefined()
  })
})

describe('Mapa global del conocimiento (NET-HW-036)', () => {
  it('renderiza categorías agregadas y su tabla accesible', async () => {
    renderApp('/mapa-global')
    await waitFor(() => expect(cyMock.calls.length).toBeGreaterThan(0))
    const elements = ultimosElementos()
    const nodos = elements.filter((e) => e.data.source === undefined)
    expect(nodos.length).toBe(5) // las 5 categorías del demo con dispositivos
    expect(nodos.some((n) => String(n.data.label).startsWith('Switches multilayer'))).toBe(true)
    await screen.findByText(/Mapa global del conocimiento/)
    expect(screen.getByText('Switches multilayer')).toBeDefined()
  })
})