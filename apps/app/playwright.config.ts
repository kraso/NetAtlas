import { defineConfig, devices } from '@playwright/test'

/**
 * E2E de NetAtlas (NET-HW-053).
 * El flujo crítico del MVP (criterio 28.1.6#3):
 *   buscar → explorar → ficha → navegar a protocolo → volver a dispositivos que lo soportan.
 * El servidor levanta el build de producción (offline-capable) vía `vite preview`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Memoria limitada en el entorno local: un worker a la vez evita OOM de los
  // navegadores headless (CI puede pasarlo por --workers).
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @netatlas/app preview --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      // Backend real de sincronización (F8A): copia temporal del seed + token
      // fijo para que el E2E navegador (cola local → sync) pueda autenticarse.
      command: 'pnpm --filter @netatlas/server server:e2e',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        NETATLAS_E2E_PORT: '8787',
      },
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})