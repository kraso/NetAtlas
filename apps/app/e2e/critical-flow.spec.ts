import { test, expect } from '@playwright/test'

/**
 * Flujo E2E crítico del MVP (criterio 28.1.6#3):
 *   buscar → explorar → ficha → navegar por la ficha → panel OSI → consulta inversa.
 * El dataset de demostración (adapter in-memory) garantiza datos deterministas.
 */
test.describe('Flujo E2E crítico — NetAtlas (28.1.6#3)', () => {
  test('buscar→explorar→ficha→capas OSI→dispositivos relacionados', async ({ page }) => {
    // 1) Dashboard con búsqueda dominante
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    await expect(page.getByRole('search')).toBeVisible()

    // 2) Acceso por categoría → explorador con resultados
    await page.getByRole('link', { name: /Interconexión y switching/i }).click()
    // El explorador muestra el árbol de categorías con la selección activada
    await expect(page.getByRole('navigation', { name: 'Árbol de categorías' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Interconexión y switching/i })).toHaveAttribute('aria-pressed', 'true')
    // El árbol filtra a CAT-SWT: vemos el Catalyst 9300 en la tabla de resultados
    await expect(page.getByText('Cisco Catalyst 9300-48P')).toBeVisible()

    // 3) Ficha del dispositivo
    await page.getByText('Cisco Catalyst 9300-48P').click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cisco Catalyst 9300-48P')

    // 4) Navegación por pestañas: Interfaces → Capas OSI
    await page.getByRole('tab', { name: 'Interfaces' }).click()
    await expect(page.getByRole('columnheader', { name: 'Etiqueta' })).toBeVisible()

    await page.getByRole('tab', { name: 'Capas OSI' }).click()
    await expect(page.getByText('Perfil OSI')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Perfil de capas OSI' })).toBeVisible()

    // 5) Consulta inversa por capas: dispositivo de la misma categoría que las termina
    //    (el 6300M multilayer entra en la selección por defecto, capa principal=2)
    await expect(page.getByText(/Misma categoría que termina/i)).toBeVisible()
    await expect(page.getByText('Aruba 6300M 48G')).toBeVisible()

    // 6) Seguir arista: volver al explorador por la ficha relacionada
    await page.getByText('Aruba 6300M 48G').click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Aruba 6300M 48G')
  })

  test('404 contextual para un slug inexistente', async ({ page }) => {
    await page.goto('/device/no-existe')
    await expect(page.getByRole('heading', { name: 'Dispositivo no encontrado' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver al explorador' })).toBeVisible()
  })
})