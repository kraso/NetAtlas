import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { cyMockState } from './cy-mock.js'

// RTL auto-limpia solo con globals habilitadas; explícito aquí para Vitest sin globals.
afterEach(() => {
  cleanup()
})

/**
 * Mock de Cytoscape para jsdom (NET-HW-030): el lienzo requiere medidas reales
 * (getBoundingClientRect) que jsdom no aporta. Capturamos la llamada y los
 * elementos en cyMockState para que los tests validen el subgrafo sin renderizar.
 */
vi.mock('cytoscape', () => {
  return {
    default: (opciones: Record<string, unknown>): Record<string, unknown> => {
      cyMockState.calls.push([opciones])
      return {
        on: () => {},
        destroy: () => {},
        elements: () => ({}),
        layout: () => ({ run: () => {} }),
        style: () => ({}),
      }
    },
  }
})