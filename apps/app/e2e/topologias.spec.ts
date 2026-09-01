import { test, expect } from '@playwright/test'

/**
 * F4 — NET-HW-033/034/036/037: flujo de topologías en el build de producción.
 *  - Visor con alternativa accesible y filtros por capa
 *  - Laboratorio: añadir dispositivos, conectar con validación, guardar
 *  - Mapa global agregado
 * El dataset demo (in-memory) es determinista; el layout se persiste en
 * localStorage del contexto (persistencia real tras recargar).
 */
test.describe('Topologías (F4)', () => {
  test('visor: nodos en tabla accesible, filtro por capa y exportación', async ({ page }) => {
    await page.goto('/topology/clos-demo')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Clos de demostración (L3)')
    await expect(page.getByRole('img', { name: /Topología Clos de demostración/ })).toBeVisible()

    // Alternativa accesible: los 6 nodos del demo aparecen en la tabla
    await page.getByText('Alternativa accesible (nodos y enlaces como tabla)').click()
    await expect(page.getByText('cisco-c9300-48p', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('mikrotik-ccr1036', { exact: true }).first()).toBeVisible()

    // Filtro por capa OSI: solo capa 1 (el 9120AXI) queda en el lienzo
    await expect(page.getByRole('img', { name: /: 12 elementos/ })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Capa 1' }).check()
    await expect(page.getByRole('img', { name: /: 1 elementos/ })).toBeVisible()

    // Exportación SVG/PNG no rompe (sin assert de descarga en headless)
    await page.getByRole('button', { name: 'Exportar SVG' }).click()
    await page.getByRole('button', { name: 'Exportar PNG' }).click()
  })

  test('laboratorio: añadir, conectar con validación y guardar topología de usuario', async ({ page }) => {
    await page.goto('/topology/nueva')
    await expect(page.getByText(/Topología vacía/)).toBeVisible()

    const buscador = page.getByTestId('buscador-topo')
    await buscador.fill('cisco-c9300-48p')
    await page.getByRole('button', { name: 'Añadir dispositivo' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'device:cisco-c9300-48p' })).toBeVisible()

    await buscador.fill('aruba-6300m-48g')
    await page.getByRole('button', { name: 'Añadir dispositivo' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'device:aruba-6300m-48g' })).toBeVisible()

    // Conectar: interfaz común (1000/10000 Mbps) → enlace válido
    await page.getByLabel('Nodo origen').selectOption('device:cisco-c9300-48p')
    await page.getByLabel('Nodo destino').selectOption('device:aruba-6300m-48g')
    await page.getByRole('button', { name: 'Validar y conectar' }).click()
    await expect(page.getByText(/device:cisco-c9300-48p → device:aruba-6300m-48g/)).toBeVisible()

    // Slug inexistente → mensaje de validación
    await buscador.fill('no-existe')
    await page.getByRole('button', { name: 'Añadir dispositivo' }).click()
    await expect(page.getByText(/no existe en el catálogo/)).toBeVisible()

    // Guardar → navega a la ficha y persiste en localStorage (recarga)
    await page.getByLabel('Nombre').fill('red-e2e')
    await page.getByRole('button', { name: 'Guardar topología' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'red-e2e' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'red-e2e' })).toBeVisible()
    await expect(page.getByText(/usuario/)).toBeVisible()
  })

  test('laboratorio: la validación rechaza la selección incompleta', async ({ page }) => {
    await page.goto('/topology/nueva')
    await page.getByTestId('buscador-topo').fill('cisco-c9300-48p')
    await page.getByRole('button', { name: 'Añadir dispositivo' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'device:cisco-c9300-48p' })).toBeVisible()
    await page.getByRole('button', { name: 'Validar y conectar' }).click()
    await expect(page.getByText(/Selecciona dos nodos distintos/)).toBeVisible()
  })

  test('mapa global: categorías agregadas con su tabla accesible', async ({ page }) => {
    await page.goto('/mapa-global')
    await expect(page.getByRole('heading', { level: 1, name: 'Mapa global del conocimiento' })).toBeVisible()
    await expect(page.getByRole('img', { name: /Mapa global: 5 categorías/ })).toBeVisible()
    await page.getByText('Alternativa accesible (categorías y enlaces como tabla)').click()
    await expect(page.getByText('Switches multilayer')).toBeVisible()
    await expect(page.getByText('Routing')).toBeVisible()
  })
})