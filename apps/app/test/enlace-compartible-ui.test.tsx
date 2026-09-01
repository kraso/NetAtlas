import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices, useServices } from '../src/composition-root.js'

/**
 * F5 refinamiento — URL compartible del comparador con veredicto: el botón
 * «Copiar enlace del reporte» genera la URL con `v=<hash>` del veredicto; al
 * abrirla, la insignia «enlace verificado» confirma que el reporte recalculado
 * coincide (o avisa de que los datos cambiaron).
 */

function renderComparar(query = ''): void {
  render(
    <MemoryRouter initialEntries={[`/comparar${query}`]}>
      <App />
    </MemoryRouter>,
  )
}

function mockClipboard(): string[] {
  const copiadas: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { copiadas.push(t) }) },
  })
  return copiadas
}

beforeEach(() => {
  setServices(useServices.getState().services)
  localStorage.clear()
  cleanup()
})

describe('Enlace compartible con veredicto (F5)', () => {
  it('al copiar el enlace, la URL incorpora ids=… y la etiqueta v=<hash>', async () => {
    const copiadas = mockClipboard()
    renderComparar('?ids=cisco-c9300-48p,aruba-2930f-48g')
    const copiar = await screen.findByRole('button', { name: 'Copiar enlace del reporte' })
    fireEvent.click(copiar)
    await waitFor(() => expect(screen.getByText(/Enlace copiado/)).toBeDefined())
    expect(copiadas.length).toBe(1)
    const url = copiadas[0]!
    expect(url).toContain('ids=cisco-c9300-48p%2Caruba-2930f-48g') // %2C = coma (URL-safe)
    expect(url).toMatch(/v=[0-9a-f]{8}/)
  })

  it('abrir un enlace con v= correcta muestra la insignia de verificación', async () => {
    // Primero se genera el reporte y se copia su enlace (captura del hash).
    const copiadas = mockClipboard()
    renderComparar('?ids=cisco-c9300-48p,aruba-2930f-48g')
    const copiar = await screen.findByRole('button', { name: 'Copiar enlace del reporte' })
    fireEvent.click(copiar)
    await waitFor(() => expect(copiadas.length).toBe(1))
    const v = copiadas[0]!.match(/v=([0-9a-f]{8})/)?.[1]
    expect(v).toBeTruthy()
    cleanup()

    // Nueva visita con el enlace completo → insignia "enlace verificado".
    renderComparar(`?ids=cisco-c9300-48p,aruba-2930f-48g&v=${v}`)
    await waitFor(() => expect(screen.getByTestId('enlace-verificado')).toBeDefined())
  })

  it('un v= incorrecto avisa de que el reporte ha cambiado', async () => {
    renderComparar('?ids=cisco-c9300-48p,aruba-2930f-48g&v=00000000')
    await waitFor(() => expect(screen.getByTestId('enlace-cambiado')).toBeDefined())
  })
})