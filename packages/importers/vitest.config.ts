import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Pool singleton: esbuild + node:sqlite disparan OOM de sistema en workers paralelos.
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
})