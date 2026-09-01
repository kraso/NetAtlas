import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { useSyncStore } from '../src/viewmodels/sync-store.js'
import { setServices, useServices } from '../src/composition-root.js'

/**
 * F8A — UI de sincronización (NET-HW-063, criterio offline+sync): la cola
 * local se encola en localStorage; el ciclo sincronizar() contra el servidor
 * (fetch mock en jsdom) envía la cola y puebla la réplica; sin servidor/red,
 * la cola permanece intacta.
 */

function renderSync(): void {
  render(
    <MemoryRouter initialEntries={['/sincronizar']}>
      <App />
    </MemoryRouter>,
  )
}

/** Mock del transporte: simula el backend que acepta contribuciones y sirve snapshot. */
function mockServidor(): { recibidas: unknown[]; replicas: unknown[] } {
  const estado = { recibidas: [] as unknown[], replicas: [{ slug: 'sw-remoto', version: 1, name: 'Switch remoto', manufacturerSlug: 'm', categoryCode: 'CAT-SWT', lifecycleStatus: 'current', updatedAt: '2025-01-01' }] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/snapshot')) {
        return new Response(JSON.stringify({ version: 1, dispositivos: estado.replicas }), { status: 200 })
      }
      if (url.includes('/api/contributions')) {
        const cuerpo = JSON.parse(String(init?.body ?? '{}')) as { entradas: { id: string }[] }
        estado.recibidas = cuerpo.entradas
        return new Response(JSON.stringify({ aceptadas: cuerpo.entradas.map((e) => e.id) }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }),
  )
  return estado
}

beforeEach(() => {
  setServices(useServices.getState().services)
  localStorage.clear()
  vi.unstubAllGlobals()
  useSyncStore.setState({
    serverUrl: 'http://servidor.test:8787',
    token: undefined,
    outbox: [],
    replicaCount: 0,
    ultimoResultado: undefined,
    error: undefined,
    pensando: false,
  })
  cleanup()
})

describe('Sincronización en la UI (F8A, NET-HW-063)', () => {
  it('encola una nota localmente (cola visible en la UI)', async () => {
    renderSync()
    const entrada = screen.getByTestId('entidad-nota') as HTMLInputElement
    fireEvent.change(entrada, { target: { value: 'device:cisco-c9300-48p' } })
    fireEvent.click(screen.getByTestId('encolar-nota'))

    await waitFor(() => expect(screen.getAllByTestId('cola-item').length).toBe(1))
    expect(screen.getByTestId('cola-item').textContent).toContain('device:cisco-c9300-48p')
    // Persistido en localStorage (supervive a recarga)
    expect(localStorage.getItem('netatlas.sync.outbox.v1')).toContain('nota')
  })

  it('al sincronizar, envía la cola y puebla la réplica local', async () => {
    const servidor = mockServidor()
    renderSync()

    fireEvent.change(screen.getByTestId('entidad-nota'), { target: { value: 'device:cisco-c9300-48p' } })
    fireEvent.click(screen.getByTestId('encolar-nota'))
    await waitFor(() => expect(screen.getAllByTestId('cola-item').length).toBe(1))

    fireEvent.click(screen.getByTestId('sync-ahora'))
    await waitFor(() => expect(screen.getByTestId('sync-resultado')).toBeDefined())
    // El servidor mock recibió la contribución y la réplica quedó poblada.
    expect(servidor.recibidas).toHaveLength(1)
    await waitFor(() => expect(screen.getByTestId('replica-count').textContent).toContain('1 dispositivos'))
    // La cola local queda vacía tras la confirmación.
    await waitFor(() => expect(screen.queryByTestId('cola-item')).toBeNull())
  })

  it('sin red: la cola permanece intacta (criterio F8A, no se pierde nada)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red no disponible') }))
    renderSync()

    fireEvent.change(screen.getByTestId('entidad-nota'), { target: { value: 'device:x' } })
    fireEvent.click(screen.getByTestId('encolar-nota'))
    await waitFor(() => expect(screen.getAllByTestId('cola-item').length).toBe(1))

    fireEvent.click(screen.getByTestId('sync-ahora'))
    // El ciclo termina sin lanzar; el resultado reporta 0 enviadas.
    await waitFor(() => expect(screen.getByTestId('sync-resultado')).toBeDefined())
    expect(screen.getByTestId('sync-resultado').textContent).toContain('enviadas 0')
    // La cola NO se pierde con la red caída.
    expect(screen.getAllByTestId('cola-item').length).toBe(1)
  })
})