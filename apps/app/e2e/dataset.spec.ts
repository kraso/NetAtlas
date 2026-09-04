import { test, expect } from '@playwright/test'

/**
 * Dataset E2E (PLAN MAESTRO §28 / ADR-047).
 *
 * Valida el dataset REAL (341 dispositivos) expuesto por el API server F8B
 * (packages/server sobre datasets/netatlas-seed.sqlite) al browser PWA vía el
 * adaptador HTTP F8B (apps/app/src/adapters/http-ui.ts). El warmezo warmeza
 * /api/snapshot?since=0 al montar App → replacea el demo de 6 (offline) por
 * los 341 del server (F1-late dataset real vía F8B).
 *
 * Baseline offline (sin server): el demo de 6 sigue validado en tests unitarios
 * (packages/data, tools/import-cli) — no requiere browser E2E.
 *
 * Flag Vite inlineado en build (F8B-baseline): VITE_API=http://127.0.0.1:8787
 */
test.describe('Dataset E2E — NetAtlas real via API F8B (341 dispositivos)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('dashboard muestra el dataset real (341 dispositivos · 26 categorías)', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('NetAtlas')

    // dashboard.tsx: "Dataset de demostración: N dispositivos · M categorías."
    // El count se refresca reactivamente cuando el warmezo HTTP termina.
    const datasetLine = page.locator('.guia-tecnica', { hasText: /Dataset de demostración/ })
    await expect(datasetLine).toContainText('341 dispositivos', { timeout: 15000 })
    await expect(datasetLine).toContainText('26 categorías')
  })

  test('el árbol de categorías raíz expone las 4 macrocategorías', async ({ page }) => {
    // Navega al explorador: el link raíz "Interconexión y switching" está en el dashboard
    await page.getByRole('link', { name: /Interconexión y switching/i }).click()
    await expect(page.getByRole('navigation', { name: /Árbol de categorías/i })).toBeVisible()

    // Las 4 macrocategorías raíz (derivadas de códigos CAT-XXX sin padre):
    //   CAT-SWT (Interconexión y switching), CAT-RTR (Routing),
    //   CAT-SEC (Seguridad), CAT-WLS (Inalámbricos)
    await expect(page.getByRole('button', { name: /Interconexión y switching/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Routing/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Seguridad/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Inalámbricos/i })).toBeVisible()
  })

  test('el buscador encuentra un dispositivo real del catálogo', async ({ page }) => {
    const input = page.locator('[data-testid="busqueda-dashboard"]')
    await expect(input).toBeVisible()
    await input.fill('Cisco')
    // El form role="search" (aria-label "Buscar hardware de redes") navega a /explore?q=Cisco
    await page.locator('form[role="search"]').locator('button[type="submit"]').click()
    // Resultados: al menos un Catalyst de los 341 aparece como Link
    await expect(page.locator('table.tabla-specs')).toContainText('Cisco')
  })

  test('navegación a la ficha del dispositivo desde el explorador por categoría', async ({ page }) => {
    await page.getByRole('link', { name: /Interconexión y switching/i }).click()
    // Expande la raíz para ver una subcategoría (Switches multilayer L3)
    await page.getByRole('button', { name: /Switches multilayer/i }).click()
    // La tabla de dispositivos de CAT-SWT-L3 muestra dispositivos reales
    await expect(page.locator('table.tabla-specs')).toContainText('Cisco')
    await page.locator('table.tabla-specs').getByRole('link').first().click()
    // Ficha del dispositivo (heading level 1 = nombre del device)
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty()
  })

  test('el mapa global (Arquitectura) muestra el grafo de categorías conectadas', async ({ page }) => {
    // Navega al mapa global deducido de las relaciones device-device del snapshot F8B.
    await page.goto('/mapa-global')
    // El aria-label del lienzo incluye counts: "Mapa global: N categorías y M relaciones".
    const canvas = page.locator('[aria-label^="Mapa global"]')
    await expect(canvas).toBeVisible({ timeout: 15000 })
    // Con 321 aristas device-device cruzando categorías, el mapa global
    // agrega ≥1 arista entre categorías (no empty).
    const label = await canvas.getAttribute('aria-label')
    expect(label).toMatch(/categorías y (\d+) relaciones/)
    const match = label?.match(/relaciones/) ? Number(label.match(/categorías y (\d+)/)?.[1]) : 0
    expect(label).not.toMatch(/categorías y 0 relaciones/)
  })

  test('la ficha muestra la genealogía curada (Historia)', async ({ page }) => {
    // Cadena 2920 → 2930F → 6300M: succeeds/replaced-by del seed + detalle F8B.
    await page.goto('/device/aruba-2930f-48g-poeplus')
    const tab = page.getByRole('tab', { name: 'Historia' })
    await expect(tab).toBeVisible({ timeout: 20000 })
    await tab.click()
    await expect(page.getByRole('link', { name: 'aruba-2920-48g' }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: 'hpe-aruba-6300m' }).first()).toBeVisible({ timeout: 10000 })
  })

  test('la ficha muestra el linaje ConnectX (Historia)', async ({ page }) => {
    // Cadena connectx-5 → connectx-6-dx → connectx-7 (seed curado + detalle F8B).
    await page.goto('/device/nvidia-connectx-6-dx')
    const tab = page.getByRole('tab', { name: 'Historia' })
    await expect(tab).toBeVisible({ timeout: 20000 })
    await tab.click()
    await expect(page.getByRole('link', { name: 'nvidia-connectx-5' }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: 'nvidia-connectx-7' }).first()).toBeVisible({ timeout: 10000 })
  })

  test('la ficha muestra el sucesor del Kalpana (Historia)', async ({ page }) => {
    // El primer switch (1989) solo tiene sucesores: Catalyst 3000 (adquisicion 1994).
    await page.goto('/device/genesis-switch-ethernet')
    const tab = page.getByRole('tab', { name: 'Historia' })
    await expect(tab).toBeVisible({ timeout: 20000 })
    await tab.click()
    await expect(page.getByRole('link', { name: 'cisco-catalyst-3000' }).first()).toBeVisible({ timeout: 10000 })
  })

  test('la ficha muestra el datasheet curado (Documentación)', async ({ page }) => {
    await page.goto('/device/fortinet-fortigate-200f')
    const tab = page.getByRole('tab', { name: 'Documentación' })
    await expect(tab).toBeVisible({ timeout: 20000 })
    await tab.click()
    await expect(page.getByText('FortiGate 200F Series Data Sheet').first()).toBeVisible({ timeout: 10000 })
  })
})
