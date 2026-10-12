import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { cyMockState } from './cy-mock.js'

// RTL auto-limpia solo con globals habilitadas; explícito aquí para Vitest sin globals.
afterEach(() => {
  cleanup()
})

/**
 * Guardarraíl de red: los unit tests NO dependen de que el puerto 8787 esté
 * libre. jsdom corre sobre Node, cuyo `fetch` global alcanza la red real, y
 * `App` dispara el warmezo del API F8B al montar (`warmezaHttpSiDisponible`).
 * Sin este bloqueo, un server escuchando en 127.0.0.1:8787 —el que levanta
 * Playwright para el E2E, por ejemplo— sustituía el dataset demo a mitad de
 * test y la suite pasaba o fallaba según lo que hubiera en la máquina.
 *
 * El fallo es explícito, igual que una máquina sin red: el warmezo lo registra
 * (`avisarPullFallido`) y conserva el dataset ya inyectado. Quien necesite HTTP
 * inyecta su propio `fetchImpl` (ver `http-ui-detalle.test.ts`) o stubea `fetch`
 * (ver `sync-ui.test.tsx`).
 */
const fetchBloqueado = (input: RequestInfo | URL): Promise<Response> =>
  Promise.reject(new Error(`fetch bloqueado en unit tests (${String(input)}): inyecta fetchImpl o stubea fetch`))

globalThis.fetch = fetchBloqueado

/**
 * Mock de Cytoscape para jsdom (NET-HW-030): el lienzo requiere medidas reales
 * (getBoundingClientRect) que jsdom no aporta. Capturamos la llamada y los
 * elementos en cyMockState para que los tests validen el subgrafo sin renderizar.
 */
vi.mock('cytoscape', () => {
  return {
    default: Object.assign(
      (opciones: Record<string, unknown>): Record<string, unknown> => {
        cyMockState.calls.push([opciones])
        return {
          on: (evento: string, selector: unknown, cb?: () => void) => {
            cyMockState.handlers[evento] = typeof cb === 'function' ? cb : (selector as () => void)
          },
          one: () => {},
          destroy: () => {},
          destroyed: () => false,
          resize: () => {},
          fit: () => {},
          zoom: () => {},
          pan: () => {},
          render: () => {},
          redraw: () => {},
          width: () => 800,
          height: () => 600,
          elements: () => ({ removeClass: () => {}, addClass: () => {} }),
          getElementById: () => ({ addClass: () => {} }),
          layout: () => ({ run: () => {} }),
          style: () => ({}),
          nodes: () => [],
          use: () => {},
        }
      },
      { use: () => {} },
    ),
  }
})