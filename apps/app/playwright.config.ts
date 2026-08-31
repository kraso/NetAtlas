import { defineConfig, devices } from '@playwright/test'

/**
 * E2E de NetAtlas (NET-HW-053).
 * El flujo crítico del MVP (criterio 28.1.6#3):
 *   buscar → explorar → ficha → navegar a protocolo → volver a dispositivos que lo soportan.
 * El servidor levanta el build de producción (offline-capable) vía `vite preview`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @netatlas/app preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})