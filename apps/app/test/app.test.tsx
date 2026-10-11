import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'
import { buildDemoDataset } from '../src/adapters/in-memory.js'

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

describe('Dashboard (NET-HW-018)', () => {
  it('muestra accesos por macrocategoría', async () => {
    renderApp('/')
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeDefined()
    // Espera a que el store cargue (efecto en App)
    expect(await screen.findByRole('link', { name: /Interconexión y switching/i })).toBeDefined()
    expect(screen.getByRole('search')).toBeDefined()
  })

  it('navega al explorador con la consulta', async () => {
    renderApp('/')
    const input = await screen.findByTestId('busqueda-dashboard') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cat:sw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    // El explorador con la query q=cat:sw se renderiza (memory router)
    expect(await screen.findByText(/Categorías/i)).toBeDefined()
  })
})

describe('Explorador (NET-HW-019)', () => {
  it('filtra por categoría y muestra resultados en tabla accesible', async () => {
    renderApp('/explore?cat=CAT-SWT')
    // Al menos un switch del dataset demo
    expect(await screen.findByText('Cisco Catalyst 9300-48P')).toBeDefined()
    const table = screen.getByRole('table')
    // Columna de selección para el comparador (F5/CU-02) + Dispositivo/Categoría/Fabricante
    expect(within(table).getAllByRole('columnheader').length).toBe(4)
  })

  it('muestra estado vacío sin consulta ni categoría', async () => {
    renderApp('/explore')
    expect(await screen.findByText(/Sin resultados/i)).toBeDefined()
  })

  it('recarga los resultados cuando el dataset remoto sustituye al demo', async () => {
    renderApp('/explore?cat=CAT-SWT')
    expect(await screen.findByText('Cisco Catalyst 9300-48P')).toBeDefined()

    // El pull remoto llama a setServices con un dataset sin switches: si el
    // explorador solo leyera los servicios al vuelo, seguiría mostrando el demo.
    const demo = buildDemoDataset()
    const sinSwitches: ReturnType<typeof buildDemoDataset> = {
      ...demo,
      devices: demo.devices.filter((d) => !d.categoryCode.startsWith('CAT-SWT')),
    }
    await act(async () => {
      setServices(buildServices(sinSwitches))
    })

    await waitFor(() => expect(screen.queryByText('Cisco Catalyst 9300-48P')).toBeNull())
    expect(screen.getByText(/Sin resultados/i)).toBeDefined()
  })
})

describe('Ficha de dispositivo (NET-HW-020)', () => {
  it('muestra resumen, especificaciones y pestañas', async () => {
    renderApp('/device/cisco-c9300-48p')
    expect(await screen.findByRole('heading', { name: 'Cisco Catalyst 9300-48P' })).toBeDefined()
    const tablist = screen.getByRole('tablist')
    expect(within(tablist).getAllByRole('tab').length).toBe(13)
    // Abrir pestaña de especificaciones
    fireEvent.click(screen.getByRole('tab', { name: 'Especificaciones' }))
    expect(screen.getByText(/Capa principal/i)).toBeDefined()
  })

  it('muestra 404 contextual para slug inexistente', async () => {
    renderApp('/device/no-existe')
    expect(await screen.findByRole('heading', { name: 'Dispositivo no encontrado' })).toBeDefined()
  })
})

describe('Panel OSI + consulta inversa (NET-HW-021)', () => {
  it('muestra panel de capas y lista dispositivos que terminan la selección', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Capas OSI' }))
    expect(screen.getByText('Perfil OSI')).toBeDefined()
    // Consulta inversa: selección por defecto es la capa primaria del 9300 (2)
    expect(await screen.findByText(/Misma categoría que termina/i)).toBeDefined()
    // El 6300M (multilayer de la misma categoría) termina la capa 2 → aparece
    expect(screen.getByText('Aruba 6300M 48G')).toBeDefined()
  })
})