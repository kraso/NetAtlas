import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Pool singleton: jsdom + sqlite (node:sqlite) disparan OOM en workers paralelos.
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