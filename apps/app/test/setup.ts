import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// RTL auto-limpia solo con globals habilitadas; explícito aquí para Vitest sin globals.
afterEach(() => {
  cleanup()
})