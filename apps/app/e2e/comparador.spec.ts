import { test, expect } from './baseline-demo.js'
import {
  activarSoloDiferencias,
  comprobarVeredictoPoe,
  exportarPdfDescargable,
  marcarTresSwitches,
} from './apoyo-comparador.js'

/**
 * F5 — CU-02 (criterio de fase): «Desde el explorador (filtro cat:sw) selecciona 3 →
 * comparador → "solo diferencias" → veredicto (PoE, uplinks, stacking) → exporta».
 * Aceptación: diferencias reales detectadas al 100% según los datos del seed demo.
 */
test.describe('Comparador de dispositivos — CU-02 (F5)', () => {
  test('selecciona 3 switches en el explorador y obtiene el veredicto con diferencias reales', async ({ page }) => {
    // 1) Explorador con la macrocategoría Switching (incluye L2 y L3)
    await marcarTresSwitches(page)

    // 2) → comparador (aviso de comparación transversal L2/L3 incluido)
    await page.getByRole('button', { name: /Comparar seleccionados \(3\)/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Comparación de dispositivos' })).toBeVisible()
    await expect(page.getByText(/Comparación transversal entre categorías/i).first()).toBeVisible()

    // 3) Veredicto con diferencias reales según los datos: PoE (0 frente a 48)
    await comprobarVeredictoPoe(page)

    // 4) Solo diferencias: la fila idéntica desaparece
    await activarSoloDiferencias(page)

    // 5) Exportación CSV y PDF descargable real con jsPDF
    await exportarPdfDescargable(page)
  })

  test('enlace compartible con veredicto: copiar y verificar al recargar (F5 refinamiento)', async ({ page }) => {
    // Intercepta el portapapeles (compatible chromium+firefox) capturando el
    // texto que el botón intenta copiar.
    await page.addInitScript(() => {
      const original = (navigator.clipboard as unknown as { writeText?: (t: string) => Promise<void> })?.writeText
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (t: string) => { (window as unknown as { __copiada?: string }).__copiada = t } },
      })
      void original
    })
    await page.goto('/comparar?ids=cisco-c9300-48p,aruba-6300m-48g,aruba-2930f-48g')
    await expect(page.getByText(/En «Puertos con PoE»/)).toBeVisible()

    await page.getByRole('button', { name: 'Copiar enlace del reporte' }).click()
    await expect(page.getByText(/Enlace copiado/)).toBeVisible()
    const url = await page.evaluate(() => (window as unknown as { __copiada?: string }).__copiada ?? '')
    expect(url).toMatch(/v=[0-9a-f]{8}/)

    // Abrir el enlace copiado: insignia de verificación tras recalcular.
    await page.goto(url)
    await expect(page.getByText(/enlace verificado/)).toBeVisible()
  })

  test('añade el tercer candidato desde el buscador del comparador', async ({ page }) => {
    await page.goto('/comparar?ids=cisco-c9300-48p,aruba-6300m-48g')
    await expect(page.getByText(/En «Puertos con PoE»/)).toBeVisible()
    await page.getByTestId('buscar-comparar').fill('2930F')
    await page.getByRole('button', { name: /Aruba 2930F 48G PoE\+/ }).click()
    await expect(page.getByText(/Comparación transversal entre categorías/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Quitar Aruba 2930F 48G PoE\+/ })).toBeVisible()
  })
})