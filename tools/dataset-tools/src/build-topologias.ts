import type { CatalogDao, NodeSqliteDriver } from '@netatlas/data'
import type { TopologyNodeProps, TopologyEdgeProps } from '@netatlas/domain'
import { primerosDe, nodo, crear } from './build-topologias-logica.js'

/**
 * Topologías de referencia (NET-HW-033/034, §13.3): tres diagramas sembrados
 * sobre dispositivos reales del seed (navegables). `demostracion-300` ejerce
 * el SLO de diagramas (§23.2: ≤300 nodos layout+render <500 ms) en E2E.
 *
 * Cada topología está en su propia función para mantener este módulo por
 * debajo del límite de 200 líneas (§Convenciones).
 */

/** Seed de la topología Clos de 3 etapas (centro de datos). */
function seedClos3Etapas(dao: CatalogDao, driver: NodeSqliteDriver): void {
  const spines = primerosDe(driver, 'CAT-DCN', 2)
  const leaves = primerosDe(driver, 'CAT-DCN', 4, 2)
  if (spines.length < 2 || leaves.length < 4) return
  const nodes: TopologyNodeProps[] = [
    nodo('category', 'CAT-DCN', 160, -80, 2),
    ...spines.map((s, i) => nodo('device', s, i * 180, 0, 2)),
    ...leaves.map((l, i) => nodo('device', l, i * 160, 180, 3)),
  ]
  const edges: TopologyEdgeProps[] = []
  for (const sp of spines) for (const lf of leaves) edges.push({ from: `device:${sp}`, to: `device:${lf}`, label: '40G uplink' })
  crear(dao, driver, { slug: 'clos-3-etapas', name: 'Centro de datos — Clos de 3 etapas', kind: 'reference', nodes, edges })
}

/** Seed de la topología típica de sucursal (router → switch → AP). */
function seedSucursalTipica(dao: CatalogDao, driver: NodeSqliteDriver): void {
  const rtr = primerosDe(driver, 'CAT-RTR-ENT', 1)[0]
  const sw = primerosDe(driver, 'CAT-SWT-L2', 1)[0]
  const ap = primerosDe(driver, 'CAT-WLS-AP', 1)[0]
  if (rtr === undefined || sw === undefined || ap === undefined) return
  crear(dao, driver, {
    slug: 'sucursal-tipica',
    name: 'Sucursal típica (router + switch + AP)',
    kind: 'reference',
    nodes: [
      nodo('device', rtr, 0, 0, 3),
      nodo('device', sw, 220, 0, 2),
      nodo('device', ap, 440, 0, 1),
      nodo('category', 'CAT-WLS-AP', 440, 120, 1),
    ],
    edges: [
      { from: `device:${rtr}`, to: `device:${sw}`, label: '1G' },
      { from: `device:${sw}`, to: `device:${ap}`, label: 'PoE+' },
      { from: `device:${ap}`, to: 'category:CAT-WLS-AP', label: 'categoría' },
    ],
  })
}

/** Seed de la demostración de 300 nodos (SLO §23.2). */
function seedDemostracion300(dao: CatalogDao, driver: NodeSqliteDriver): void {
  let todos = primerosDe(driver, 'CAT-IFC', 300)
  if (todos.length > 0) {
    if (todos.length < 300) {
      const extra = driver.prepare('SELECT slug FROM device ORDER BY id').all() as { slug: string }[]
      for (const e of extra) {
        if (todos.length >= 300) break
        if (!todos.includes(String(e.slug))) todos.push(String(e.slug))
      }
    }
    const nodes: TopologyNodeProps[] = todos.slice(0, 300).map((s, i) =>
      nodo('device', s, (i % 20) * 60, Math.floor(i / 20) * 60, 3),
    )
    const edges: TopologyEdgeProps[] = []
    for (let i = 1; i < nodes.length; i++) edges.push({ from: `device:${nodes[i - 1]!.entitySlug}`, to: `device:${nodes[i]!.entitySlug}`, linkKind: 'link' })
    for (let i = 20; i < nodes.length; i += 25) edges.push({ from: `device:${nodes[0]!.entitySlug}`, to: `device:${nodes[i]!.entitySlug}`, linkKind: 'link' })
    crear(dao, driver, { slug: 'demostracion-300', name: 'Demostración — 300 nodos (SLO de diagramas)', kind: 'reference', nodes, edges })
  }
}

/** Orquesta el seed de todas las topologías de referencia. */
export function seedTopologies(dao: CatalogDao, driver: NodeSqliteDriver): void {
  seedClos3Etapas(dao, driver)
  seedSucursalTipica(dao, driver)
  seedDemostracion300(dao, driver)
}
