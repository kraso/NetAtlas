import type { SqliteDriver, SqlRow } from '../driver.js'
import { Topology } from '@netatlas/domain'
import type { TopologyEdgeProps, TopologyPosition, TopologyRepository } from '@netatlas/domain'

/**
 * Adaptador SQLite del puerto TopologyRepository (NET-HW-033/034, §13.3).
 *
 * El esquema guarda entity_id INTEGER (device.id / category.id); el dominio
 * trabaja con (entityType, entitySlug). Este adaptador traduce en ambos
 * sentidos, como relationship hace con subject_id. La persistencia de layout
 * (saveLayout) actualiza solo las coordenadas de topology_node.
 */

/** Resolución id → slug por tipo de entidad (device / category). */
const SLUG_SQL: Record<string, { table: string; idCol: string; slugCol: string }> = {
  device: { table: 'device', idCol: 'id', slugCol: 'slug' },
  category: { table: 'category', idCol: 'id', slugCol: 'code' },
}

export class SqliteTopologyRepository implements TopologyRepository {
  constructor(private readonly db: SqliteDriver) {}

  async list(): Promise<readonly Topology[]> {
    const rows = this.db.prepare('SELECT * FROM topology ORDER BY kind, name').all() as SqlRow[]
    const out: Topology[] = []
    for (const row of rows) {
      const t = await this.rowToTopology(row)
      if (t) out.push(t)
    }
    return out
  }

  async bySlug(slug: string): Promise<Topology | undefined> {
    const row = this.db.prepare('SELECT * FROM topology WHERE slug = ?').get(slug) as SqlRow | undefined
    return row ? this.rowToTopology(row) : undefined
  }

  async upsert(topology: Topology): Promise<void> {
    const existing = this.db.prepare('SELECT id FROM topology WHERE slug = ?').get(topology.slug.value) as
      | { id: number }
      | undefined
    this.db.transaction(() => {
      let topologyId: number
      if (existing) {
        topologyId = Number(existing.id)
        // Reemplazo limpio de nodos y aristas (el agregado es la fuente de verdad)
        this.db.prepare('DELETE FROM topology_edge WHERE topology_id = ?').run(topologyId)
        this.db.prepare('DELETE FROM topology_node WHERE topology_id = ?').run(topologyId)
        this.db
          .prepare('UPDATE topology SET name = ?, kind = ?, metadata = ? WHERE id = ?')
          .run(topology.name, topology.kind, JSON.stringify(topology.metadata), topologyId)
      } else {
        const res = this.db
          .prepare('INSERT INTO topology (slug, name, kind, metadata) VALUES (?, ?, ?, ?)')
          .run(topology.slug.value, topology.name, topology.kind, JSON.stringify(topology.metadata))
        topologyId = Number(res.lastInsertRowid)
      }

      const nodeIdByOpenId = new Map<string, number>()
      for (const node of topology.nodes) {
        const entityId = this.resolveEntityId(node.entityType, node.entitySlug)
        if (entityId === undefined) continue
        const res = this.db
          .prepare(
            `INSERT INTO topology_node (topology_id, entity_type, entity_id, x, y, layer_hint)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(topologyId, node.entityType, entityId, node.x ?? null, node.y ?? null, node.layerHint ?? null)
        nodeIdByOpenId.set(node.id, Number(res.lastInsertRowid))
      }
      for (const edge of topology.edges) {
        const from = nodeIdByOpenId.get(edge.from)
        const to = nodeIdByOpenId.get(edge.to)
        if (from === undefined || to === undefined) continue
        const mediumId = edge.mediumCode !== undefined ? this.mediumIdByCode(edge.mediumCode) ?? null : null
        this.db
          .prepare(
            `INSERT INTO topology_edge (topology_id, from_node, to_node, link_kind, medium_id, label)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(topologyId, from, to, edge.linkKind, mediumId, edge.label ?? null)
      }
    })
  }

  async saveLayout(slug: string, positions: ReadonlyArray<TopologyPosition>): Promise<void> {
    const topology = this.db.prepare('SELECT id FROM topology WHERE slug = ?').get(slug) as { id: number } | undefined
    if (!topology) return
    const topologyId = Number(topology.id)
    this.db.transaction(() => {
      for (const pos of positions) {
        const bracket = pos.nodeId.indexOf(':')
        const entityType = pos.nodeId.slice(0, bracket)
        const entitySlug = pos.nodeId.slice(bracket + 1)
        const entityId = this.resolveEntityId(entityType, entitySlug)
        if (entityId === undefined) continue
        this.db
          .prepare(
            `UPDATE topology_node SET x = ?, y = ? WHERE topology_id = ? AND entity_type = ? AND entity_id = ?`,
          )
          .run(pos.x, pos.y, topologyId, entityType, entityId)
      }
    })
  }

  async remove(slug: string): Promise<void> {
    const topology = this.db.prepare('SELECT id FROM topology WHERE slug = ?').get(slug) as { id: number } | undefined
    if (!topology) return
    const topologyId = Number(topology.id)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM topology_edge WHERE topology_id = ?').run(topologyId)
      this.db.prepare('DELETE FROM topology_node WHERE topology_id = ?').run(topologyId)
      this.db.prepare('DELETE FROM topology WHERE id = ?').run(topologyId)
    })
  }

  // ── privado ─────────────────────────────────────────────────────────

  private async rowToTopology(row: SqlRow): Promise<Topology | undefined> {
    const topologyId = Number(row.id)
    const nodeRows = this.db
      .prepare('SELECT * FROM topology_node WHERE topology_id = ? ORDER BY id')
      .all(topologyId) as SqlRow[]
    const edgeRows = this.db
      .prepare('SELECT * FROM topology_edge WHERE topology_id = ? ORDER BY id')
      .all(topologyId) as SqlRow[]

    const idPorNodoDb = new Map<number, string>()
    const nodes = nodeRows.map((n) => {
      const type = String(n.entity_type)
      const slug = this.slugByEntityId(type, Number(n.entity_id)) ?? `#${n.entity_id}`
      const id = `${type}:${slug}`
      idPorNodoDb.set(Number(n.id), id)
      return {
        entityType: type as 'device' | 'category',
        entitySlug: slug,
        x: n.x !== null ? Number(n.x) : undefined,
        y: n.y !== null ? Number(n.y) : undefined,
        layerHint: n.layer_hint !== null ? Number(n.layer_hint) : undefined,
      }
    })
    const edges = edgeRows.flatMap((e): TopologyEdgeProps[] => {
      const from = idPorNodoDb.get(Number(e.from_node))
      const to = idPorNodoDb.get(Number(e.to_node))
      if (from === undefined || to === undefined) return []
      return [
        {
          from,
          to,
          linkKind: String(e.link_kind),
          mediumCode: e.medium_id !== null ? this.mediumCodeById(Number(e.medium_id)) : undefined,
          label: e.label !== null ? String(e.label) : undefined,
        },
      ]
    })

    try {
      return Topology.create({
        slug: String(row.slug),
        name: String(row.name),
        kind: String(row.kind) as 'reference' | 'user',
        nodes,
        edges,
        metadata: row.metadata ? (JSON.parse(String(row.metadata)) as Record<string, unknown>) : undefined,
      })
    } catch {
      // Fila corrupta (p. ej. nodo apuntando a entidad desaparecida): no bloquea el visor.
      return undefined
    }
  }

  private resolveEntityId(type: string, slug: string): number | undefined {
    const def = SLUG_SQL[type]
    if (!def) return undefined
    const row = this.db
      .prepare(`SELECT ${def.idCol} AS id FROM ${def.table} WHERE ${def.slugCol} = ?`)
      .get(slug) as { id: number } | undefined
    return row ? Number(row.id) : undefined
  }

  private slugByEntityId(type: string, id: number): string | undefined {
    const def = SLUG_SQL[type]
    if (!def) return undefined
    const row = this.db
      .prepare(`SELECT ${def.slugCol} AS slug FROM ${def.table} WHERE ${def.idCol} = ?`)
      .get(id) as { slug: string | number } | undefined
    return row ? String(row.slug) : undefined
  }

  private mediumIdByCode(code: string): number | undefined {
    const row = this.db.prepare('SELECT id FROM medium WHERE code = ?').get(code) as { id: number } | undefined
    return row ? Number(row.id) : undefined
  }

  private mediumCodeById(id: number): string | undefined {
    const row = this.db.prepare('SELECT code FROM medium WHERE id = ?').get(id) as { code: string } | undefined
    return row ? String(row.code) : undefined
  }
}