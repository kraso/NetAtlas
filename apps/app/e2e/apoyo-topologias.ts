import { expect, type Page } from '@playwright/test'

/**
 * Ayudas del laboratorio de topologías (F4) para el spec E2E: los pasos
 * repetidos viven aquí para que el cuerpo de cada test quede corto y con una
 * sola responsabilidad.
 */

/** Añade al laboratorio el dispositivo con ese slug del catálogo. */
export async function anadirDispositivo(page: Page, slug: string): Promise<void> {
  await page.getByTestId('buscador-topo').fill(slug)
  await page.getByRole('button', { name: 'Añadir dispositivo' }).click()
}

/** Añade el dispositivo y espera a verlo listado como nodo del lienzo. */
export async function anadirYVerNodo(page: Page, slug: string): Promise<void> {
  await anadirDispositivo(page, slug)
  await expect(page.getByRole('listitem').filter({ hasText: `device:${slug}` })).toBeVisible()
}

/**
 * Siembra en localStorage una topología de usuario de `nodos` nodos en cadena,
 * con el mismo formato que el resto del demo. Con ≥1.500 el visor entra en modo
 * agregado (ADR-03); el slug y el nombre van fijos para poder afirmar sobre ellos.
 */
export async function sembrarTopologiaEscala(page: Page, nodos: number): Promise<void> {
  await page.addInitScript((total) => {
    const listaNodos = Array.from({ length: total }, (_, i) => ({
      entityType: 'device' as const,
      entitySlug: `virt-${String(i).padStart(4, '0')}`,
      x: (i % 40) * 30,
      y: Math.floor(i / 40) * 30,
      layerHint: 2,
    }))
    const topologia = {
      slug: { value: 'escala-1600' },
      name: 'Escala — 1600 nodos',
      kind: 'user' as const,
      nodes: listaNodos,
      edges: listaNodos.slice(1).map((_, i) => ({
        from: `device:virt-${String(i).padStart(4, '0')}`,
        to: `device:virt-${String(i + 1).padStart(4, '0')}`,
      })),
      metadata: { semillaF4: true },
    }
    const previas = localStorage.getItem('netatlas.topologies.user.v1')
    const existentes = previas ? (JSON.parse(previas) as unknown[]) : []
    localStorage.setItem('netatlas.topologies.user.v1', JSON.stringify([...existentes, topologia]))
  }, nodos)
}

/** Conecta dos nodos ya añadidos; la validación decide si el enlace procede. */
export async function conectarNodos(page: Page, origen: string, destino: string): Promise<void> {
  await page.getByLabel('Nodo origen').selectOption(origen)
  await page.getByLabel('Nodo destino').selectOption(destino)
  await page.getByRole('button', { name: 'Validar y conectar' }).click()
}
