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
  try {
    localStorage.clear()
  } catch {
    // sin almacenamiento
  }
})

/**
 * F5 — NET-HW-040/041/042: comparador N columnas con reglas del dominio,
 * modo solo-diferencias, veredicto y transversal; selección desde el
 * explorador (CU-02).
 */
describe('Comparador de dispositivos (F5 / §18)', () => {
  it('compara dos switches L3 aplicando higher-better (▲ mejor / ▼ limitación)', async () => {
    renderApp('/comparar?ids=cisco-c9300-48p,aruba-6300m-48g')
    await screen.findByText('Veredicto')

    // Capacidad de conmutación: 256 (9300) vs 176 (6300M) → ▲ 9300
    const celda = screen.getByTestId('celda-switching_capacity_gbps-cisco-c9300-48p')
    expect(celda).toHaveTextContent('256')
    expect(screen.getByTestId('best-switching_capacity_gbps')).toBeDefined()
    const perdedor = screen.getByTestId('celda-switching_capacity_gbps-aruba-6300m-48g')
    expect(perdedor).toHaveTextContent('176')

    // Puertos con PoE: 9300 no ofrece PoE; 6300M sí (48) → ▲ 6300M
    expect(screen.getByTestId('best-puertos_poe')).toBeDefined()
    const celdaPoe9300 = screen.getByTestId('celda-puertos_poe-cisco-c9300-48p')
    expect(celdaPoe9300).toHaveTextContent('0')
  })

  it('modo solo diferencias oculta las filas idénticas', async () => {
    renderApp('/comparar?ids=cisco-c9300-48p,aruba-6300m-48g')
    await screen.findByText('Veredicto')
    expect(screen.getByText(/Puertos totales/)).toBeDefined()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Modo solo diferencias' }))
    expect(screen.queryByText(/Puertos totales/)).toBeNull()
    expect(screen.getAllByText(/Puertos con PoE/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Capacidad de conmutación/).length).toBeGreaterThanOrEqual(1)
  })

  it('expande la fila para ver la explicación de la limitación', async () => {
    renderApp('/comparar?ids=cisco-c9300-48p,aruba-6300m-48g')
    await screen.findByText('Veredicto')
    fireEvent.click(screen.getByRole('button', { name: /Capacidad de conmutación/ }))
    // La explicación aparece en el detalle (y el veredicto lo repite)
    const explicaciones = await screen.findAllByText(/aruba-6300m-48g: 176 Gbps frente a 256 Gbps/i)
    expect(explicaciones.length).toBeGreaterThanOrEqual(1)
  })

  it('marca la comparación transversal y lista los atributos específicos (CU-02 con 3 switches)', async () => {
    renderApp('/comparar?ids=cisco-c9300-48p,aruba-6300m-48g,aruba-2930f-48g')
    const avisos = await screen.findAllByText(/Comparación transversal entre categorías/i)
    expect(avisos.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/atributos específicos no comparados/i)).toBeDefined()
    expect(screen.getAllByText(/Apilable/).length).toBeGreaterThanOrEqual(1)
    // fila común con diferencias reales: puertos PoE 0/48/48 → ▲ en cada uno con PoE
    expect(screen.getAllByTestId('best-puertos_poe').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('celda-puertos_poe-cisco-c9300-48p')).toHaveTextContent('0')
  })

  it('añade un candidato desde el buscador y lo quita con ✕', async () => {
    renderApp('/comparar?ids=cisco-c9300-48p')
    await screen.findByText(/necesita al menos dos dispositivos/i)
    const input = screen.getByTestId('buscar-comparar')
    fireEvent.change(input, { target: { value: '6300M' } })
    expect(await screen.findByRole('button', { name: /Aruba 6300M 48G/ })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Aruba 6300M 48G/ }))
    await screen.findByText('Veredicto')
    // Quitar el 6300M
    fireEvent.click(screen.getByRole('button', { name: /Quitar Aruba 6300M 48G/ }))
    await screen.findByText(/necesita al menos dos dispositivos/i)
  })
})

describe('Selección desde el explorador (CU-02)', () => {
  it('marca dos dispositivos y enruta al comparador', async () => {
    renderApp('/explore?cat=CAT-SWT-L3')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Comparar Cisco Catalyst 9300-48P' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Comparar Aruba 6300M 48G' }))
    fireEvent.click(await screen.findByRole('button', { name: /Comparar seleccionados \(2\)/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Comparación de dispositivos' })).toBeDefined()
  })
})