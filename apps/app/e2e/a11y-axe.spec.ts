import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * F2 — NET-HW-058: auditoría de accesibilidad CONTINUA con axe en CI.
 *
 * Recorre las pantallas principales de la app (dashboard, explorador, ficha,
 * catálogos, calidad) y ejecuta axe-core con las reglas WCAG 2.2 (A y AA).
 * Cualquier violación bloquea la suite E2E → el job `e2e` de CI actúa como
 * guardarraíl de accesibilidad. Complementa la a11y ya probada en jsdom
 * (NET-HW-026) con una verificación sobre el build real.
 *
 * Excepciones documentadas (solo si aplican) a través de `disableRules` con
 * motivo en el comentario; la política es 0 violaciones.
 */

// Pantallas núcleo de la app (mismos fixtures deterministas del demo).
const PANTALLAS: readonly { ruta: string; nombre: string }[] = [
  { ruta: '/', nombre: 'Dashboard' },
  { ruta: '/explore', nombre: 'Explorador' },
  { ruta: '/device/cisco-c9300-48p', nombre: 'Ficha de dispositivo' },
  { ruta: '/catalogos', nombre: 'Catálogos' },
  { ruta: '/calidad', nombre: 'Calidad del dataset' },
]

test.describe('Auditoría axe continua (F2, NET-HW-058)', () => {
  for (const pantalla of PANTALLAS) {
    test(`sin violaciones WCAG A/AA en ${pantalla.nombre}`, async ({ page }) => {
      await page.goto(pantalla.ruta)
      // Espera a que la pantalla cargue su contenido dinámico (SPA).
      await page.waitForLoadState('networkidle')

      const resultados = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()

      expect(
        resultados.violations.map((v) => ({
          id: v.id,
          impacto: v.impact,
          nodos: v.nodes.map((n) => n.target.join(' ')).slice(0, 3),
          ayuda: v.help,
        })),
        `Violaciones en ${pantalla.nombre}: ${resultados.violations.length}`,
      ).toEqual([])
    })
  }

  test('el explorador con filtro activo y la ficha con pestañas siguen sin violaciones', async ({ page }) => {
    await page.goto('/explore?cat=CAT-SWT')
    await page.waitForLoadState('networkidle')
    const explorador = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(explorador.violations).toEqual([])

    await page.goto('/device/cisco-c9300-48p')
    await page.waitForLoadState('networkidle')
    // Abre una pestaña extra (Capas OSI) para cubrir contendido dinámico.
    await page.getByRole('tab', { name: 'Capas OSI' }).click()
    const ficha = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(ficha.violations).toEqual([])
  })

  test('la pestaña Arquitectura del FortiGate 200F curada (F2) no introduce violaciones', async ({ page }) => {
    await page.goto('/device/fortinet-200f')
    await page.waitForLoadState('networkidle')
    await page.getByRole('tab', { name: 'Arquitectura' }).click()
    // El contenido curado del datasheet está presente (tabla + fuente + confianza).
    await expect(page.getByText(/Intel Xeon D-1627/)).toBeVisible()
    const resultados = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(resultados.violations).toEqual([])
  })
})