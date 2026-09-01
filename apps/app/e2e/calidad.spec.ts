import { test, expect } from '@playwright/test'

/**
 * F6 — NET-HW-047/049: dashboard de calidad con cobertura de fuentes,
 * confianza, cola de reconciliación con diff (resolver/rechazar) y manifiesto.
 * En el modo demo, la cola se persiste en localStorage del contexto.
 */
test.describe('Dashboard de calidad (F6)', () => {
  test('muestra las métricas, la cobertura por categoría y la confianza', async ({ page }) => {
    await page.goto('/calidad')
    await expect(page.getByRole('heading', { level: 1, name: 'Calidad del dataset' })).toBeVisible()
    await expect(page.getByText('Cobertura de fuentes por categoría')).toBeVisible()
    await expect(page.getByText('Distribución de confianza')).toBeVisible()
    // El demo: 6 dispositivos, cobertura 67%
    await expect(page.getByText('67%')).toBeVisible()
    await expect(page.getByTestId('confianza-official')).toBeVisible()
  })

  test('resuelve un candidato de la cola con diff mediante Aceptar/Rechazar', async ({ page }) => {
    // Sembrar un candidato sin pasar por el pipeline (DIY sino evade UI)
    await page.addInitScript(() => {
      const lista = [
        {
          id: 1,
          entradaSlug: 'sw-incompleto',
          existenteSlug: 'cisco-c9300-48p',
          score: 0.83,
          diff: [
            { campo: 'name', entrante: 'Switch nuevo', existente: 'Cisco Catalyst 9300-48P' },
            { campo: 'category', entrante: 'CAT-SWT', existente: 'CAT-SWT-L3' },
          ],
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ]
      localStorage.setItem('netatlas.reconciliation.v1', JSON.stringify(lista))
    })

    await page.goto('/calidad')
    await expect(page.getByTestId('reconciliacion-1')).toBeVisible()
    // Diff lado a lado visible
    await expect(page.getByText('Switch nuevo')).toBeVisible()
    await expect(page.getByText('Cisco Catalyst 9300-48P')).toBeVisible()

    // Rechazar → desaparece y queda vacía
    await page.getByRole('button', { name: 'Rechazar' }).click()
    await expect(page.getByText('No hay candidatos a revisión.')).toBeVisible()
  })
})