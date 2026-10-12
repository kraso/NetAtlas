import { expect, type Page } from '@playwright/test'

/**
 * Ayudas del comparador (CU-02 / F5) para el spec E2E: los pasos del recorrido
 * viven aquí para que el cuerpo del test quede corto y con una sola
 * responsabilidad. Los tres switches son fixtures del demo y están curados para
 * que sus diferencias (PoE, apilado) sean reales.
 */

/** Abre el explorador en Switching y marca los tres switches del CU-02. */
export async function marcarTresSwitches(page: Page): Promise<void> {
  await page.goto('/explore?cat=CAT-SWT')
  await page.getByRole('checkbox', { name: 'Comparar Cisco Catalyst 9300-48P' }).check()
  await page.getByRole('checkbox', { name: 'Comparar Aruba 6300M 48G' }).check()
  await page.getByRole('checkbox', { name: 'Comparar Aruba 2930F 48G PoE+' }).check()
}

/** Veredicto con diferencias reales del demo: PoE (0 frente a 48) y apilado. */
export async function comprobarVeredictoPoe(page: Page): Promise<void> {
  await expect(page.getByText(/En «Puertos con PoE»/)).toBeVisible()
  await expect(page.getByText(/cisco-c9300-48p: 0 frente a 48/i)).toBeVisible()
  await expect(page.getByText(/Presupuesto PoE/).first()).toBeVisible()
  await expect(page.getByText(/Apilable/).first()).toBeVisible()
}

/** Con «solo diferencias», la fila idéntica (Puertos totales) desaparece. */
export async function activarSoloDiferencias(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Modo solo diferencias' }).check()
  await expect(page.getByRole('button', { name: /Puertos totales/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Puertos con PoE/ })).toBeVisible()
}

/** Exporta CSV y PDF; el PDF debe descargarse con su nombre con fecha. */
export async function exportarPdfDescargable(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exportar CSV' }).click()
  const pdf = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar PDF' }).click()
  const descarga = await pdf
  expect(descarga.suggestedFilename()).toMatch(/^netatlas-comparacion-\d{4}-\d{2}-\d{2}\.pdf$/)
}
