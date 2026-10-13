import {
  React, describe, expect, it, beforeEach, vi, render, screen, fireEvent, waitFor, cleanup,
  MemoryRouter, App, useServices, setServices,
} from './apoyo-ui.js'

/**
 * F7 — UI del asistente (§21.2/§21.4):
 * flag `ai.enabled` OFF por defecto; al activarlo, chat con citas obligatorias
 * y respuesta honesta cuando no hay datos.
 */
function renderApp(route = '/asistente'): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

function textoDesactivada(): HTMLElement {
  return screen.getByText((content: string) => content.includes('desactivada'))
}

async function activarIA(): Promise<void> {
  await waitFor(() => expect(textoDesactivada()).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Activar asistente local' }))
  await waitFor(() => expect(screen.getByLabelText('Pregunta al asistente')).toBeDefined())
}

beforeEach(() => {
  setServices(useServices.getState().services)
  localStorage.removeItem('netatlas.ai.enabled')
  cleanup()
})

describe('Asistente IA (F7)', () => {
  it('flag off por defecto: muestra el panel desactivado (feature flag §21.4)', () => {
    renderApp()
    expect(textoDesactivada()).toBeDefined()
    expect(screen.queryByLabelText('Pregunta al asistente')).toBeNull()
  })

  it('al activarse, el asistente responde con citas a entidades reales', async () => {
    renderApp()
    await activarIA()

    fireEvent.change(screen.getByLabelText('Pregunta al asistente'), {
      target: { value: '¿Qué capas cubre el Catalyst 9300?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }))

    await waitFor(() => expect(screen.getByTestId('msg-asistente')).toBeDefined(), { timeout: 5000 })
    // Cita(s) enlazada(s) al dispositivo real del demo (cisco-c9300-48p).
    const links = screen.getAllByRole('link', { name: /Cisco Catalyst 9300/i })
    expect(links.length).toBeGreaterThanOrEqual(1)
    expect(links[0]!.getAttribute('href')).toContain('/device/cisco-c9300-48p')
  })

  it('pregunta sin datos → respuesta honesta (guardarraíl, no inventa)', async () => {
    renderApp()
    await activarIA()

    fireEvent.change(screen.getByLabelText('Pregunta al asistente'), {
      target: { value: '¿Cuál es el rendimiento de algo que no existe en el catálogo?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }))

    await waitFor(() => expect(screen.getAllByTestId('msg-asistente').length).toBeGreaterThan(0), { timeout: 5000 })
    expect(screen.getByText(/No tengo datos validados/i)).toBeDefined()
  })

  it('desactivar devuelve al panel apagado', async () => {
    renderApp()
    await activarIA()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar IA' }))
    await waitFor(() => expect(textoDesactivada()).toBeDefined())
  })

  it('si la consulta falla, el chat lo dice y el fallo queda registrado con contexto', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fallo = vi
      .spyOn(useServices.getState().services.asistente, 'ask')
      .mockRejectedValue(new Error('sin datos locales'))
    renderApp()
    await activarIA()

    fireEvent.change(screen.getByLabelText('Pregunta al asistente'), {
      target: { value: '¿Qué puertos tiene el 9300?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }))

    // El store conserva los mensajes de los casos anteriores del fichero: se
    // espera a la última respuesta, que es la de esta consulta.
    await waitFor(() => {
      const respuestas = screen.getAllByTestId('msg-asistente')
      expect(respuestas.at(-1)?.textContent).toContain('Lo siento')
    })
    // El chat ya avisaba; lo que faltaba era el rastro en el log.
    expect(log).toHaveBeenCalledWith('[ERROR] no se pudo completar la consulta del asistente', {
      texto: '¿Qué puertos tiene el 9300?',
      error: expect.any(Error),
    })
    fallo.mockRestore()
    log.mockRestore()
  })
})