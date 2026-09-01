import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

/**
 * F3 — EAV en la UI (§9.4): facetas dinámicas en el explorador y valores
 * por atributo en la pestaña Capacidades de la ficha.
 */
describe('F3 — facetas dinámicas en el explorador (EAV)', () => {
  it('muestra el panel de filtros dinámicos al elegir categoría con atributos facetados', async () => {
    renderApp('/explore?cat=CAT-SWT-L3')
    expect(await screen.findByText('Filtros dinámicos')).toBeDefined()
    // Definiciones EAV demo: capacidad de conmutación (CAT-SWT-L3)
    expect(await screen.findByText(/Capacidad de conmutación/i)).toBeDefined()
    // Conteos por valor: 176 (6300M) y 256 (9300)
    await screen.findByRole('button', { name: /256/i })
  })

  it('filtra los resultados al activar una faceta (AND por patrón de filtro)', async () => {
    renderApp('/explore?cat=CAT-SWT-L3')
    const boton256 = await screen.findByRole('button', { name: /256/i })
    fireEvent.click(boton256)
    // Solo el 9300 (256 Gbps) permanece; el 6300M (176) se oculta
    await screen.findByRole('link', { name: 'Cisco Catalyst 9300-48P' })
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Aruba 6300M 48G' })).toBeNull()
    })
    expect(boton256.getAttribute('aria-pressed')).toBe('true')
  })

  it('una categoría sin atributos facetados no muestra el panel', async () => {
    renderApp('/explore?cat=CAT-ACC')
    expect(await screen.findByText(/no tiene atributos facetados curados/i)).toBeDefined()
  })
})

describe('F3 — pestaña Capacidades con valores EAV (§9.4)', () => {
  it('muestra los atributos de categoría del dispositivo (enum y número)', async () => {
    renderApp('/device/aruba-2930f-48g')
    fireEvent.click(await screen.findByRole('tab', { name: 'Capacidades' }))
    expect(await screen.findByText('Apilable')).toBeDefined()
    expect(await screen.findByText('370')).toBeDefined() // poe_budget_w
    expect(screen.getByText('Presupuesto PoE')).toBeDefined()
  })

  it('muestra la capacidad de conmutación de un switch multilayer', async () => {
    renderApp('/device/cisco-c9300-48p')
    fireEvent.click(await screen.findByRole('tab', { name: 'Capacidades' }))
    expect(await screen.findByText('Capacidad de conmutación')).toBeDefined()
    expect(await screen.findByText('256')).toBeDefined()
  })

  it('dispositivo sin atributos muestra empty-state curado', async () => {
    // Dataset demo sin valores EAV para el 9120AXI → la pestaña muestra el empty-state
    const data = buildDatasetSinEav('cisco-9120axi')
    setServices(buildServices(data))
    renderApp('/device/cisco-9120axi')
    fireEvent.click(await screen.findByRole('tab', { name: 'Capacidades' }))
    expect(await screen.findByText(/sin atributos de categoría curados/i)).toBeDefined()
  })
})

/** Copia del dataset demo quitando los valores EAV de un slug. */
function buildDatasetSinEav(slug: string): ReturnType<typeof buildDemoDataset> {
  const data = buildDemoDataset()
  return { ...data, deviceAttributeValues: (data.deviceAttributeValues ?? []).filter((v) => v.deviceSlug !== slug) }
}