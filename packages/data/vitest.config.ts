import { defineConfig } from 'vitest/config'

export default defineConfig({
  ssr: {
    // node:sqlite es un builtin nuevo de Node (22.5+) que Vite no conoce;
    // se externaliza en SSR para que lo resuelva el runtime.
    external: ['node:sqlite'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})