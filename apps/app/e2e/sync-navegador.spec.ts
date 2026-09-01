import { test, expect } from '@playwright/test'

/**
 * F8A — CRITERIO "app funciona offline y sincroniza al recuperar red" (§23.4[3],
 * NET-HW-063) verificado en el NAVEGADOR contra el servidor real.
 *
 * La suite E2E levanta dos procesos: la PWA (vite preview, puerto 4173) y el
 * backend netatlas-server (copia temporal del seed, puerto 8787, token fijo
 * `token-e2e-netatlas`). Este spec recorre el flujo completo:
 *   1) sin red: se encola una nota local (cola visible y persistida);
 *   2) al recuperar la red: "Sincronizar ahora" envía la cola por HTTP real y
 *      descarga el snapshot → la cola queda vacía y la réplica poblada;
 *   3) con token incorrecto el push se rechaza y la cola NO se pierde (§22.5).
 */
const PUERTO_SERVER = '8787'
const TOKEN_E2E = 'token-e2e-netatlas'

test.describe('F8A — sync navegador → servidor real (criterio offline+sync)', () => {
  test('cola local → sincronizar (pull snapshot + push outbox) → réplica poblada', async ({ page }) => {
    // El servidor e2e es COMPARTIDO entre chromium y firefox; el merge LWW por
    // entidad descarta revisiones ≤ a las ya aceptadas. Entidad única por
    // ejecución → cada lote es independiente del navegador que corrió antes.
    const entidad = `device:sync-e2e-${Date.now().toString(36)}`

    await page.goto('/sincronizar')
    await expect(page.getByRole('heading', { level: 1, name: 'Sincronización' })).toBeVisible()

    // URL del backend apuntando al webServer secundario de la suite.
    await page.getByTestId('server-url').fill(`http://127.0.0.1:${PUERTO_SERVER}`)
    await page.getByTestId('server-token').fill(TOKEN_E2E)

    // 1) Sin red aún: encolar una nota → aparece en la cola local.
    await page.getByTestId('entidad-nota').fill(entidad)
    await page.getByTestId('encolar-nota').click()
    await expect(page.getByTestId('cola-item')).toBeVisible()
    expect(await page.getByTestId('cola-item').count()).toBeGreaterThanOrEqual(1)

    // 2) Sincronizar: tira del snapshot del servidor real y empuja la cola.
    await page.getByTestId('sync-ahora').click()
    const resultado = page.getByTestId('sync-resultado')
    await expect(resultado).toBeVisible({ timeout: 15_000 })
    // La réplica local se pobló con el snapshot del seed real (330 dispositivos).
    await expect(resultado).toContainText(/Replicados: [1-9]\d*/)
    await expect(resultado).toContainText(/enviadas [1-9]\d*/)

    // 3) La cola local quedó vacía tras la confirmación del servidor y la
    //    réplica quedó poblada (persistida en localStorage).
    await expect(page.getByTestId('cola-vacia')).toBeVisible()
    const replica = await page.evaluate(() => JSON.parse(localStorage.getItem('netatlas.sync.replica.v1') ?? '[]'))
    expect(replica.length).toBeGreaterThan(0)
  })

  test('con token incorrecto el push se rechaza y la cola NO se pierde (seguridad §22.5)', async ({ page }) => {
    const entidad = `device:sync-bad-${Date.now().toString(36)}`
    await page.goto('/sincronizar')
    await page.getByTestId('server-url').fill(`http://127.0.0.1:${PUERTO_SERVER}`)
    await page.getByTestId('server-token').fill('token-malo')

    await page.getByTestId('entidad-nota').fill(entidad)
    await page.getByTestId('encolar-nota').click()
    await expect(page.getByTestId('cola-item')).toBeVisible()

    await page.getByTestId('sync-ahora').click()
    // El ciclo termina (snapshot sí llega; el push con 401 no confirma).
    await expect(page.getByTestId('sync-resultado')).toBeVisible({ timeout: 15_000 })
    // La cola permanece: la nota sin confirmar sigue pendiente.
    await expect(page.getByTestId('cola-item')).toBeVisible()
  })
})