import { test as base, expect } from '@playwright/test'

/**
 * Baseline demo (F1 in-memory) para los specs que afirman sobre el catálogo
 * curado del demo.
 *
 * `App.tsx` warmeza el pull F8B (`/api/snapshot`) al montar: si el backend
 * responde, el snapshot real (345 dispositivos) REEMPLAZA al demo (6) en el
 * store reactivo. Los specs de UI (comparador, navegación, topologías, a11y,
 * asistente, calidad, SLO de diagramas) están escritos contra los fixtures del
 * demo —slugs como `cisco-c9300-48p`, la topología `estres-300`— y con el pull
 * vivo se quedan sin datos a mitad de test, de forma no determinista.
 *
 * Hacen falta los dos cortes:
 *  - `serviceWorkers: 'block'`: el SW reemite el fetch del pull fuera del
 *    alcance de `page.route`, y en Firefox eso dejaba pasar el snapshot real
 *    (el spec de a11y abría la ficha del 9300 y encontraba «Dispositivo no
 *    encontrado»). Además quita de en medio el precache entre ejecuciones: aquí
 *    no se prueba el SW, se prueba la UI.
 *  - `context.route` con 503, el mismo camino que un backend caído: estado
 *    SOPORTADO por la app —«si falla la red, se conserva el dataset actual»
 *    (offline-first F8A, `avisarPullFallido`)—, equivalente al modo avión.
 *
 * Los specs que NO usan este baseline son los que prueban justo lo contrario:
 * `dataset.spec.ts` (dataset real vía pull F8B), `sync-navegador.spec.ts`
 * (ciclo de sincronización) y `pwa-offline.spec.ts` (Service Worker y offline),
 * todos con `@playwright/test` directo.
 */
export const test = base.extend<{ sinPullF8B: void }>({
  serviceWorkers: 'block',
  sinPullF8B: [
    async ({ context }, use) => {
      await context.route('**/api/**', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      )
      await use()
    },
    { auto: true },
  ],
})

export { expect }
