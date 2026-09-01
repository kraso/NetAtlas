import { test, expect } from '@playwright/test'

/**
 * SLO de diagramas (§23.2 del plan maestro): "Grafo local (≤300 nodos)
 * layout+render < 500 ms".
 *
 * La topología `estres-300` del demo tiene exactamente 300 nodos y 311
 * aristas. Medimos el tiempo entre la aparición del lienzo Cytoscape y el
 * render de sus 300 etiquetas de nodo (layout+render reales del motor).
 */
test.describe('SLO de diagramas (§23.2)', () => {
  test('300 nodos: layout+render < 500 ms', async ({ page }) => {
    await page.goto('/topology/estres-300')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Estrés — 300 nodos')

    const canvas = page.getByTestId('canvas-topologia')
    await canvas.waitFor({ state: 'visible' })

    // El canvas marca el primer render real de cytoscape (layout+render)
    await expect(canvas).toHaveAttribute('data-cy-render-ms', /\d+/, { timeout: 5000 })
    const ms = Number(await canvas.getAttribute('data-cy-render-ms'))

    // El SLO mide exclusivamente layout+render del grafo (no el arranque)
    expect(ms, `layout+render con 300 nodos: ${ms} ms`).toBeLessThan(500)
  })
})