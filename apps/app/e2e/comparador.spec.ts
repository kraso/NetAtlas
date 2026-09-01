import { test, expect } from '@playwright/test'

/**
 * F5 — CU-02 (criterio de fase): «Desde el explorador (filtro cat:sw) selecciona 3 →
 * comparador → "solo diferencias" → veredicto (PoE, uplinks, stacking) → exporta».
 * Aceptación: diferencias reales detectadas al 100% según los datos del seed demo.
 */
test.describe('Comparador de dispositivos — CU-02 (F5)', () => {
  test('selecciona 3 switches en el explorador y obtiene el veredicto con diferencias reales', async ({ page }) => {
    // 1) Explorador con la macrocategoría Switching (incluye L2 y L3)
    await page.goto('/explore?cat=CAT-SWT')
    await expect(page.getByRole('checkbox', { name: 'Comparar Cisco Catalyst 9300-48P' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Comparar Cisco Catalyst 9300-48P' }).check()
    await page.getByRole('checkbox', { name: 'Comparar Aruba 6300M 48G' }).check()
    await page.getByRole('checkbox', { name: 'Comparar Aruba 2930F 48G PoE+' }).check()

    // 2) → comparador
    await page.getByRole('button', { name: /Comparar seleccionados \(3\)/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Comparación de dispositivos' })).toBeVisible()

    // Comparación transversal L2/L3 avisada, con atributos específicos
    await expect(page.getByText(/Comparación transversal entre categorías/i).first()).toBeVisible()

    // 3) Veredicto con diferencias reales según los datos: PoE (0 frente a 48)
    await expect(page.getByText(/En «Puertos con PoE»/)).toBeVisible()
    await expect(page.getByText(/cisco-c9300-48p: 0 frente a 48/i)).toBeVisible()
    // Atributos específicos listados (span y veredicto lo repiten)
    await expect(page.getByText(/Presupuesto PoE/).first()).toBeVisible()
    await expect(page.getByText(/Apilable/).first()).toBeVisible()

    // 4) Solo diferencias: la fila idéntica (Puertos totales) desaparece
    await page.getByRole('checkbox', { name: 'Modo solo diferencias' }).check()
    await expect(page.getByRole('button', { name: /Puertos totales/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Puertos con PoE/ })).toBeVisible()

    // 5) Exportación CSV (descargable) y PDF descargable real con jsPDF
    await page.getByRole('button', { name: 'Exportar CSV' }).click()
    const pdf = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar PDF' }).click()
    const descarga = await pdf
    expect(descarga.suggestedFilename()).toMatch(/^netatlas-comparacion-\d{4}-\d{2}-\d{2}\.pdf$/)
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