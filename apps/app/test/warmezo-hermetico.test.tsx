import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { buildServices, setServices, useServices, warmezaHttpSiDisponible } from '../src/composition-root.js'

/**
 * Hermeticidad de la suite (NET-HW-053). Montar `App` dispara el warmezo del API
 * F8B contra 127.0.0.1:8787: con un server vivo en ese puerto, el pull real
 * reemplazaba el dataset inyectado y varios tests fallaban por el entorno y no
 * por el código. Aquí se fija el invariante contrario: el warmezo se intenta,
 * falla (el `fetch` global está bloqueado en unit tests, ver `test/setup.ts`) y
 * el dataset inyectado sobrevive.
 */
describe('Warmezo HTTP hermético (F8B)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('si el pull del API local falla, el dataset inyectado sobrevive', async () => {
    const espia = vi.spyOn(globalThis, 'fetch')
    setServices(buildServices())
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    await warmezaHttpSiDisponible()

    // El warmezo SÍ se intentó contra el API local...
    expect(String(espia.mock.calls[0]?.[0])).toContain('/api/snapshot')
    // ...y lo que rechaza es el guardarraíl de la suite (ver `test/setup.ts`), no
    // una red ausente: sin él, con el puerto cerrado, este test seguiría verde y
    // la suite volvería a depender de la máquina.
    await expect(globalThis.fetch('http://127.0.0.1:8787/api/snapshot')).rejects.toThrow(
      /fetch bloqueado en unit tests/,
    )
    // Al fallar no tocó los servicios: sigue el demo de 6 dispositivos.
    const { dataset } = useServices.getState().services
    expect(dataset.devices).toHaveLength(6)
    expect(dataset.devices.map((d) => d.slug.value)).toContain('cisco-c9300-48p')
  })
})
