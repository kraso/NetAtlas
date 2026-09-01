import { test, expect } from '@playwright/test'

/**
 * Criterio O3 / F3 — navegación relacional no lineal (§10 objetivo O3, cuadro F3):
 * desde CUALQUIER entidad se alcanza cualquier entidad relacionada en ≤2 clics.
 * El dataset de demostración (adapter in-memory) es determinista.
 */
test.describe('Navegación ≤2 clics entre entidades relacionadas (O3/F3)', () => {
  test('dispositivo → protocolo soportado (1 clic desde la entidad)', async ({ page }) => {
    await page.goto('/device/cisco-c9300-48p')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cisco Catalyst 9300-48P')

    // 1 clic: seguir la arista supports-protocol hacia el protocolo
    await page.getByRole('link', { name: 'ospf' }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ospf')
  })

  test('dispositivo → antecesor genealógico (2 clics: pestaña + enlace)', async ({ page }) => {
    await page.goto('/device/aruba-6300m-48g')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Aruba 6300M 48G')

    // Clic 1: pestaña Historia → árbol evolutivo
    await page.getByRole('tab', { name: 'Historia' }).click()
    await expect(page.getByRole('heading', { name: 'Antecesores' })).toBeVisible()
    // Clic 2: desde el árbol, el antecesor 2930F
    await page.getByRole('link', { name: 'aruba-2930f-48g' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Aruba 2930F 48G')
  })

  test('dispositivo → similar (2 clics: pestaña Compatibilidad + enlace)', async ({ page }) => {
    await page.goto('/device/cisco-c9300-48p')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cisco Catalyst 9300-48P')

    // Clic 1: pestaña Compatibilidad → similares curados
    await page.getByRole('tab', { name: 'Compatibilidad' }).click()
    await expect(page.getByRole('heading', { name: 'Similares curados (1)' })).toBeVisible()
    // Clic 2: la entidad similar (competición L3)
    await page.getByRole('link', { name: 'aruba-6300m-48g', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Aruba 6300M 48G')
  })

  test('explorador → ficha → protocolo (2 clics desde el hub de navegación)', async ({ page }) => {
    await page.goto('/explore?cat=CAT-SWT-L3')
    // Clic 1: de la tabla de resultados a la ficha
    await page.getByRole('link', { name: 'Cisco Catalyst 9300-48P' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cisco Catalyst 9300-48P')
    // Clic 2: de la ficha a una entidad relacionada (protocolo)
    await page.getByRole('link', { name: 'bgp' }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('bgp')
  })
})