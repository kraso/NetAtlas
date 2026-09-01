import { test, expect } from '@playwright/test'

/**
 * F7 — asistente IA (§21): flag `ai.enabled` off por defecto, chat con citas
 * obligatorias enlazadas a fichas reales, respuesta honesta "no tengo datos"
 * y generación de topología desde lenguaje natural. Corre en el demo
 * (in-memory), igual que el resto de la suite E2E.
 */
test.describe('Asistente IA (F7)', () => {
  test('flag off por defecto: la vista muestra el panel desactivado', async ({ page }) => {
    await page.goto('/asistente')
    await expect(page.getByRole('heading', { level: 1, name: 'Asistente IA' })).toBeVisible()
    await expect(page.getByText(/desactivada/)).toBeVisible()
    await expect(page.getByLabel('Pregunta al asistente')).toHaveCount(0)
  })

  test('al activarlo, responde con citas enlazadas a un dispositivo real', async ({ page }) => {
    await page.goto('/asistente')
    await page.getByRole('button', { name: 'Activar asistente local' }).click()
    const input = page.getByLabel('Pregunta al asistente')
    await expect(input).toBeVisible()

    await input.fill('¿Qué capas cubre el Catalyst 9300?')
    await page.getByRole('button', { name: 'Preguntar' }).click()

    const mensaje = page.getByTestId('msg-asistente').first()
    await expect(mensaje).toBeVisible()
    // Cita enlazada a la ficha real del demo
    const cita = page.getByRole('link', { name: /Cisco Catalyst 9300/i }).first()
    await expect(cita).toBeVisible()
    await expect(cita).toHaveAttribute('href', /\/device\/cisco-c9300-48p$/)
  })

  test('sin datos → respuesta honesta (no inventa especificaciones)', async ({ page }) => {
    await page.goto('/asistente')
    await page.getByRole('button', { name: 'Activar asistente local' }).click()
    const input = page.getByLabel('Pregunta al asistente')
    await expect(input).toBeVisible()

    await input.fill('¿Cuánto cuesta un dispositivo inexistente-xyz?')
    await page.getByRole('button', { name: 'Preguntar' }).click()

    await expect(page.getByTestId('msg-asistente').first()).toBeVisible()
    await expect(page.getByText(/No tengo datos validados/)).toBeVisible()
  })

  test('genera topología desde lenguaje natural y muestra las herramientas ejecutadas', async ({ page }) => {
    await page.goto('/asistente')
    await page.getByRole('button', { name: 'Activar asistente local' }).click()
    const input = page.getByLabel('Pregunta al asistente')
    await expect(input).toBeVisible()

    await input.fill('Crea una topología con dos switches y un router')
    await page.getByRole('button', { name: 'Preguntar' }).click()

    await expect(page.getByTestId('msg-asistente').first()).toBeVisible()
    // Transparencia §21.1[5]: herramienta build_topology ejecutada (dentro del
    // <details> colapsado, que se abre con un clic)
    await page.getByText(/Herramientas ejecutadas/).click()
    await expect(page.getByText('build_topology')).toBeVisible()
  })
})