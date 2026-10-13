import {
  React, describe, expect, it, beforeEach, vi, render, screen, within, fireEvent, act, waitFor,
  MemoryRouter, App, setServices, buildServices,
} from './apoyo-ui.js'
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

/**
 * Un fallo de carga no puede quedarse en la consola: el estado del store lo
 * publica y la vista lo muestra con `role="alert"` (AGENTS.md).
 */
describe('Fallos de carga visibles', () => {
  it('el catálogo caído se avisa en el dashboard en vez de contarse como 0 categorías', async () => {
    const services = buildServices()
    const fallo = vi.spyOn(services.catalog, 'listCategories').mockRejectedValue(new Error('catálogo caído'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    setServices(services)

    renderApp('/')
    const aviso = await screen.findByTestId('error-catalogo')
    expect(aviso.textContent).toContain('No se pudo cargar el catálogo de categorías.')
    expect(log).toHaveBeenCalledWith('[ERROR] no se pudo cargar el catálogo de categorías', {
      revision: expect.any(Number),
      error: expect.any(Error),
    })
    fallo.mockRestore()
    log.mockRestore()
  })

  it('el fallo de carga del explorador no se disfraza de «sin resultados»', async () => {
    const services = buildServices()
    const fallo = vi.spyOn(services.devices, 'listByCategory').mockRejectedValue(new Error('sin red'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    setServices(services)

    renderApp('/explore?cat=CAT-SWT')
    const aviso = await screen.findByTestId('error-explorador')
    expect(aviso.textContent).toContain('No se pudieron cargar los resultados')
    // La vista no puede concluir «sin resultados» de una carga que falló.
    expect(screen.queryByText(/Sin resultados/)).toBeNull()
    expect(log).toHaveBeenCalledWith('[ERROR] no se pudieron cargar los resultados del explorador', {
      selectedCat: 'CAT-SWT',
      query: '',
      error: expect.any(Error),
    })
    fallo.mockRestore()
    log.mockRestore()
  })

  it('el contador del dataset no se queda en «0 dispositivos» cuando falla', async () => {
    const services = buildServices()
    const fallo = vi.spyOn(services.devices, 'count').mockRejectedValue(new Error('sin dataset'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    setServices(services)

    renderApp('/')
    const aviso = await screen.findByTestId('error-conteo')
    expect(aviso.textContent).toContain('No se pudo contar los dispositivos del dataset.')
    expect(log).toHaveBeenCalledWith('[ERROR] no se pudo contar los dispositivos del dataset', {
      error: expect.any(Error),
    })
    fallo.mockRestore()
    log.mockRestore()
  })
})