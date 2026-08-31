import { defineConfig } from 'vitest/config'

export default defineConfig({
  ssr: {
    external: ['node:sqlite'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})