import { test, expect } from '@playwright/test'

/**
 * Dataset E2E — baseline F1 (PLAN MAESTRO §28).
 * Verifica que la app UI (browser demo) expone el dataset demo determinista
 * que buildDemoDataset() construye en memoria (6 dispositivos · 6 categorías).
 *
 * Esto está alineado con ADR-047: el frontend browser usa el adaptador
 * in-memory demo (offine, 0 dependencias Node). El acervo de 330 dispositivos
 * real de datasets/netatlas-seed.sqlite se valida aparte vía sqlite tests
 * (packages/data, tools/import-cli, tools/dataset-tools).
 */
test.describe('Dataset E2E — NetAtlas demo baseline (§28)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('dashboard muestra el dataset demo (6 dispositivos · 6 categorías)', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('NetAtlas')

    // dashboard.tsx línea 51-53: "Dataset de demostración: N dispositivos · M categorías."
    const datasetLine = page.locator('.guia-tecnica', { hasText: /Dataset de demostración/ })
    await expect(datasetLine).toContainText('6 dispositivos')
    await expect(datasetLine).toContainText('6 categorías')
  })

  test('el árbol de categorías raíz expone las 4 macrocategorías (6 categorías total)', async ({ page }) => {
    // Navega al explorador: el link raíz "Interconexión y switching" está en el dashboard
    await page.getByRole('link', { name: /Interconexión y switching/i }).click()
    await expect(page.getByRole('navigation', { name: /Árbol de categorías/i })).toBeVisible()

    // Raíces: Switching, Routing, Seguridad, Inalámbricos
    await expect(page.getByRole('button', { name: /Interconexión y switching/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Routing/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Seguridad/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Inalámbricos/i })).toBeVisible()
    // Subcategorías (hijas): totales 6 = 4 raíces + 2 hijas (CAT-SWT-L2, CAT-SWT-L3)
    await expect(page.getByRole('button', { name: /Switches capa 2/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Switches multilayer/i })).toBeVisible()
  })

  test('el buscador encuentra un dispositivo del dataset demo', async ({ page }) => {
    const input = page.locator('[data-testid="busqueda-dashboard"]')
    await expect(input).toBeVisible()
    await input.fill('Cisco')
    // El form role="search" (aria-label "Buscar hardware de redes") navega a /explore?q=Cisco
    await page.locator('form[role="search"]').locator('button[type="submit"]').click()
    // Resultados: el Catalyst 9300 del dataset demo aparece como Link
    await expect(page.locator('table.tabla-specs')).toContainText('Cisco Catalyst 9300-48P')
  })

  test('navegación a la ficha del dispositivo desde el explorador por categoría', async ({ page }) => {
    await page.getByRole('link', { name: /Interconexión y switching/i }).click()
    // Expande la raíz para ver la subcategoría multilayer
    await page.getByRole('button', { name: /Switches multilayer/i }).click()
    // La ficha del Catalyst 9300 está en CAT-SWT-L3
    await expect(page.locator('table.tabla-specs')).toContainText('Cisco Catalyst 9300-48P')
    await page.getByRole('link', { name: /Cisco Catalyst 9300-48P/i }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cisco Catalyst 9300-48P')
  })
})
