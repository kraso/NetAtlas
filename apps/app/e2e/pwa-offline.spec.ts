import { test, expect } from '@playwright/test'

/**
 * PWA offline (NET-HW-051 / §23.4).
 * Criterio 28.1.6#4 (parcial web): modo avión — tras la primera carga y con el
 * Service Worker activo, la app sigue navegando sin red (navegación SPA +
 * deep-link resuelto por navigateFallback del precache).
 *
 * Este spec NO usa el baseline demo (ver `baseline-demo.ts`): aquí el Service
 * Worker es el objeto de la prueba y hay que dejarle actuar. Por eso el
 * recorrido se apoya solo en datos que están en el demo Y en el snapshot real
 * —el dispositivo Cisco Catalyst 9300-48P, que cuelga de `CAT-SWT-L3` en
 * ambos— y no en el nombre de las categorías, que si el pull F8B reemplaza el
 * demo a mitad de carga quedan con su código (`/api/categories` caído → la app
 * deriva las categorías del snapshot).
 *
 * Registro del SW + reload + modo avión + navegación no caben en el timeout por
 * defecto (30 s): en CI el último paso se quedaba sin presupuesto.
 */
test.describe('PWA offline (28.1.6#4 — parcial web)', () => {
  test.setTimeout(60_000)

  test('navega y recarga sin red una vez el SW precachea', async ({ page, context }) => {
    // 1) Primera carga con red: registra el SW y espera a que esté activo (ready)
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    await page.evaluate(() => navigator.serviceWorker.ready)

    // 2) Reload: ahora la página está controlada por el SW (clientsClaim)
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    const controlado = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return Boolean(reg?.active) && Boolean(navigator.serviceWorker.controller)
    })
    expect(controlado).toBe(true)

    // 3) Modo avión
    await context.setOffline(true)

    // 4) Navegación SPA sin red: el chunk de la ruta se sirve del precache
    await page.getByRole('link', { name: 'Explorar' }).click()
    await expect(page.getByRole('navigation', { name: 'Árbol de categorías' })).toBeVisible()

    // 5) Deep-link sin red resuelto por navigateFallback del precache
    await page.goto('/explore?cat=CAT-SWT-L3')
    const tabla = page.locator('table.tabla-specs')
    await expect(tabla).toContainText('Cisco Catalyst 9300-48P')

    // 6) La ficha del dispositivo se abre igual sin red (datos ya en memoria)
    await tabla.getByRole('link', { name: 'Cisco Catalyst 9300-48P' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cisco Catalyst 9300-48P')
  })
})
