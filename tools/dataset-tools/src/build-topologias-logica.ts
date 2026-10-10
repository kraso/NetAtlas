import type { CatalogDao, NodeSqliteDriver } from '@netatlas/data'
import type { TopologyNodeProps, TopologyEdgeProps } from '@netatlas/domain'

/**
 * Topologías de referencia (NET-HW-033/034, §13.3): tres diagramas sembrados
 * sobre dispositivos reales del seed (navegables). `demostracion-300` ejerce
 * el SLO de diagramas (§23.2: ≤300 nodos layout+render <500 ms) en E2E.
 *
 * Los helpers (`primerosDe`, `nodo`, `crear`) y cada seed de topología están
 * en `build-topologias-logica.ts`.
 */

/** Extrae los primeros `limit` dispositivos de una categoría. */
export function primerosDe(driver: NodeSqliteDriver, categoryCode: string, limit: number, offset = 0): string[] {
  const rows = driver
    .prepare(
      `SELECT d.slug AS slug FROM device d
       JOIN category c ON c.id = d.category_id
       WHERE c.code = ? ORDER BY d.id LIMIT ? OFFSET ?`,
    )
    .all(categoryCode, limit, offset) as { slug: string }[]
  return rows.map((r) => String(r.slug))
}

/** Crea un nodo de topología con coordenadas y layer hint. */
export function nodo(
  type: 'device' | 'category',
  slug: string,
  x: number,
  y: number,
  layerHint?: number,
): TopologyNodeProps {
  return { entityType: type, entitySlug: slug, x, y, layerHint }
}

/** Definición de una topología de referencia del seed. */
export interface DefTopologia {
  readonly slug: string
  readonly name: string
  readonly kind: 'reference'
  readonly nodes: TopologyNodeProps[]
  readonly edges: TopologyEdgeProps[]
}

/** Persiste una topología de referencia en la base. */
export function crear(dao: CatalogDao, driver: NodeSqliteDriver, def: DefTopologia): void {
  if (def.nodes.length === 0) return
  // Todo o nada: la topología, sus nodos y sus aristas se escriben en una
  // transacción, de modo que un fallo no deje una topología a medias.
  driver.transaction(() => {
    const topologyId = Number(
      driver.prepare("INSERT INTO topology (slug, name, kind, metadata) VALUES (?, ?, ?, '{}')").run(def.slug, def.name, def.kind).lastInsertRowid,
    )
    const nodeIdByOpenId = insertarNodos(dao, driver, topologyId, def)
    insertarAristas(dao, driver, topologyId, def, nodeIdByOpenId)
  })
}

/** Inserta los nodos y devuelve el mapa id-abierto → id interno. */
function insertarNodos(
  dao: CatalogDao,
  driver: NodeSqliteDriver,
  topologyId: number,
  def: DefTopologia,
): Map<string, number> {
  const nodeIdByOpenId = new Map<string, number>()
  for (const n of def.nodes) {
    const entityId = n.entityType === 'device' ? dao.deviceId(n.entitySlug) : dao.categoryId(n.entitySlug)
    if (entityId === undefined) {
      console.warn(`[WARN] dataset:build — topología "${def.slug}": no existe ${n.entityType}:"${n.entitySlug}". Nodo omitido.`)
      continue
    }
    const res = driver
      .prepare('INSERT INTO topology_node (topology_id, entity_type, entity_id, x, y, layer_hint) VALUES (?, ?, ?, ?, ?, ?)')
      .run(topologyId, n.entityType, entityId, n.x ?? null, n.y ?? null, n.layerHint ?? null)
    nodeIdByOpenId.set(`${n.entityType}:${n.entitySlug}`, Number(res.lastInsertRowid))
  }
  return nodeIdByOpenId
}

/** Inserta las aristas entre los nodos ya insertados. */
function insertarAristas(
  dao: CatalogDao,
  driver: NodeSqliteDriver,
  topologyId: number,
  def: DefTopologia,
  nodeIdByOpenId: ReadonlyMap<string, number>,
): void {
  for (const e of def.edges) {
    const from = nodeIdByOpenId.get(e.from)
    const to = nodeIdByOpenId.get(e.to)
    if (from === undefined || to === undefined) {
      console.warn(`[WARN] dataset:build — topología "${def.slug}": arista ${e.from} → ${e.to} sin ambos nodos. Omitida.`)
      continue
    }
    const mediumId = e.mediumCode !== undefined ? dao.mediumId(e.mediumCode, 'cobre') : null
    driver
      .prepare('INSERT INTO topology_edge (topology_id, from_node, to_node, link_kind, medium_id, label) VALUES (?, ?, ?, ?, ?, ?)')
      .run(topologyId, from, to, e.linkKind ?? 'link', mediumId, e.label ?? null)
  }
}
