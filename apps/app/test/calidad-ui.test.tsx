import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, buildServices } from '../src/composition-root.js'
import { useQualityStore } from '../src/viewmodels/quality-store.js'
import type { InMemoryQualityRepository } from '../src/adapters/in-memory.js'

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
 * F6 — NET-HW-047/049: dashboard de calidad con cobertura, confianza,
 * cola de reconciliación con diff (resolver/rechazar) y manifiesto.
 */
describe('Dashboard de calidad (F6)', () => {
  it('muestra las métricas del dataset demo', async () => {
    renderApp('/calidad')
    expect(await screen.findByText('Calidad del dataset')).toBeDefined()
    await screen.findByText('Cobertura de fuentes por categoría')

    // Métricas del demo: dispositivos, cobertura y confianza
    expect(screen.getAllByText('Dispositivos').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('67%')).toBeDefined() // cobertura de fuentes del demo
    const filas = screen.getAllByRole('row')
    expect(filas.length).toBeGreaterThan(2) // cabecera + categorías
    // Distribución de confianza presente (official/third-party del demo)
    expect(screen.getByTestId('confianza-official')).toBeDefined()
  })

  it('resuelve un candidato de la cola con diff: aceptar la vacía y rechazar limpia', async () => {
    // Siembra un candidato demo
    const repo = (buildServices().quality as InMemoryQualityRepository)
    await repo.crearCandidatoDemo('sw-nuevo', 'cisco-c9300-48p', 0.81, [
      { campo: 'name', entrante: 'Switch nuevo', existente: 'Cisco Catalyst 9300-48P' },
      { campo: 'category', entrante: 'CAT-SWT', existente: 'CAT-SWT-L3' },
    ])

    renderApp('/calidad')
    const tarjeta = await screen.findByTestId('reconciliacion-1')
    expect(tarjeta).toBeDefined()
    // Diff lado a lado visible
    expect(screen.getByText('Switch nuevo')).toBeDefined()
    expect(screen.getByText('Cisco Catalyst 9300-48P')).toBeDefined()

    // Rechazar → desaparece de pendientes
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(screen.getByText(/No hay candidatos a revisión/)).toBeDefined())
    // La cola del store quedó vacía tras la recarga
    expect(useQualityStore.getState().pendientes.length).toBe(0)
  })

  it('indica que el manifiesto no está disponible en el modo demo', async () => {
    renderApp('/calidad')
    await screen.findByText('Calidad del dataset')
    expect(await screen.findByText(/manifiesto no disponible en el modo demo/i)).toBeDefined()
  })
})