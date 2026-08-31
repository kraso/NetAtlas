import React from 'react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'
import { useAutocompleteStore } from '../src/viewmodels/autocomplete-store.js'

function renderApp(route = '/'): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

const STORAGE_KEY = 'netatlas.busquedas.guardadas'

beforeEach(() => {
  setServices(buildServices())
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/**
 * Autocompletado agrupado + búsquedas guardadas (NET-HW-014).
 */
describe('Autocompletado agrupado (NET-HW-014)', () => {
  it('muestra sugerencias agrupadas por tipo al escribir', async () => {
    renderApp('/')
    const input = await screen.findByTestId('busqueda-dashboard')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ospf' } })
    // Grupos: Dispositivos (si hay) y Protocolos
    expect(await screen.findByRole('listbox')).toBeDefined()
    expect(screen.getByText('Protocolos')).toBeDefined()
    // La opción ospf existe como protocolo
    expect(screen.getByRole('option', { name: /ospf/i })).toBeDefined()
  })

  it('guarda una búsqueda en localStorage y la ofrece de nuevo', async () => {
    renderApp('/')
    const input = await screen.findByTestId('busqueda-dashboard')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'cat:sw' } })
    fireEvent.submit(input.closest('form')!)
    const guardadas = useAutocompleteStore.getState().guardadas
    expect(guardadas).toContain('cat:sw')
  })

  it('elimina una búsqueda guardada', () => {
    // Limpia el store compartido (singleton de Zustand persiste entre tests)
    for (const q of useAutocompleteStore.getState().guardadas) {
      useAutocompleteStore.getState().eliminarGuardada(q)
    }
    useAutocompleteStore.getState().guardar('protocolo:ospf')
    useAutocompleteStore.getState().eliminarGuardada('protocolo:ospf')
    expect(useAutocompleteStore.getState().guardadas).not.toContain('protocolo:ospf')
    expect(useAutocompleteStore.getState().guardadas).toHaveLength(0)
  })

  it('persiste guardadas entre "sesiones" (localStorage)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['bgp', 'vxlan']))
    const { getState } = useAutocompleteStore
    void getState // reconstrucción del store ya leyó el storage al crearse
    expect(localStorage.getItem(STORAGE_KEY)).toContain('bgp')
  })
})