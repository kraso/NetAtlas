import { Topology } from '@netatlas/domain'
import type { InMemoryDataset, UiTopologyRepo } from './in-memory-tipos.js'
import { storageGet, storageRemove, storageSet } from './in-memory-almacenamiento.js'

// ── Topologías in-memory (F4 §13.3) ─────────────────────────────────────────
// Las topologías de referencia viven en el dataset; el layout se persiste como
// override por slug en localStorage (el visor abre igual tras recargar). Las
// topologías de usuario (laboratorio, NET-HW-034) se guardan enteras.

const K_TOPOLOGIAS_USUARIO = 'netatlas.topologies.user.v1'
const layoutKey = (slug: string): string => `netatlas.layout.${slug}`

/** Reconstruye una Topology desde su representación JSON (la serialización de getters no es directa). */
function topologyFromJson(j: Record<string, unknown>): Topology {
  const nodes = (j.nodes as { entityType: string; entitySlug: string; x?: number; y?: number; layerHint?: number }[]).map((n) => ({
    entityType: n.entityType as 'device' | 'category',
    entitySlug: n.entitySlug,
    x: n.x,
    y: n.y,
    layerHint: n.layerHint,
  }))
  const edges = (j.edges as { from: string; to: string; linkKind?: string; mediumCode?: string; label?: string }[]).map((e) => ({
    from: e.from,
    to: e.to,
    linkKind: e.linkKind,
    mediumCode: e.mediumCode,
    label: e.label,
  }))
  return Topology.create({
    slug: String((j.slug as { value: string }).value ?? j.slug),
    name: String(j.name),
    kind: String(j.kind) as 'reference' | 'user',
    nodes,
    edges,
    metadata: (j.metadata ?? {}) as Record<string, unknown>,
  })
}

export class InMemoryTopologyRepository implements UiTopologyRepo {
  constructor(private readonly data: InMemoryDataset) {}

  async list(): Promise<readonly Topology[]> {
    const demo = (this.data.topologies ?? []).map((t) => this.conLayout(t))
    const usuario = this.leerUsuarias().map((t) => this.conLayout(t))
    return [...demo, ...usuario]
  }

  async bySlug(slug: string): Promise<Topology | undefined> {
    const demo = (this.data.topologies ?? []).find((t) => t.slug.value === slug)
    const usuario = this.leerUsuarias().find((t) => t.slug.value === slug)
    const base = demo ?? usuario
    return base ? this.conLayout(base) : undefined
  }

  async upsert(topology: Topology): Promise<void> {
    if (topology.kind === 'user') {
      const lista = this.leerUsuarias().filter((t) => t.slug.value !== topology.slug.value)
      lista.push(topology)
      storageSet(K_TOPOLOGIAS_USUARIO, JSON.stringify(lista))
    }
    // Las de referencia son de solo lectura; el layout se persiste por override.
  }

  async saveLayout(slug: string, positions: ReadonlyArray<{ nodeId: string; x: number; y: number }>): Promise<void> {
    const mapa: Record<string, { x: number; y: number }> = {}
    for (const p of positions) mapa[p.nodeId] = { x: p.x, y: p.y }
    storageSet(layoutKey(slug), JSON.stringify(mapa))
  }

  async remove(slug: string): Promise<void> {
    storageSet(K_TOPOLOGIAS_USUARIO, JSON.stringify(this.leerUsuarias().filter((t) => t.slug.value !== slug)))
    storageRemove(layoutKey(slug))
  }

  private leerUsuarias(): Topology[] {
    const raw = storageGet(K_TOPOLOGIAS_USUARIO)
    if (!raw) return []
    try {
      const lista = JSON.parse(raw) as Record<string, unknown>[]
      return lista.map(topologyFromJson).filter((t): t is Topology => t.kind === 'user')
    } catch {
      return []
    }
  }

  private conLayout(t: Topology): Topology {
    const raw = storageGet(layoutKey(t.slug.value))
    if (!raw) return t
    try {
      const mapa = JSON.parse(raw) as Record<string, { x: number; y: number }>
      return t.withLayout(
        Object.entries(mapa).map(([nodeId, v]) => ({ nodeId, x: v.x, y: v.y })),
      )
    } catch {
      return t
    }
  }
}
