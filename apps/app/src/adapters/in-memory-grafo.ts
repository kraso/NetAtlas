import type { Relationship } from '@netatlas/domain'
import type { GraphNode, GraphRepository, NeighborsQuery, Path } from '@netatlas/domain'
import type { InMemoryDataset, UiGraphEdge, UiGraphNode, UiGraphSubgraph } from './in-memory-tipos.js'

/** Construye el subgrafo a partir de aristas normalizadas del dominio. */
export function buildSubgraph(relationships: readonly Relationship[]): UiGraphSubgraph {
  const nodes = new Map<string, UiGraphNode>()
  const edges: UiGraphEdge[] = []
  const predicados = new Map<string, number>()
  for (const r of relationships) {
    const sourceId = `${r.subject.type}:${r.subject.slug}`
    const targetId = `${r.object.type}:${r.object.slug}`
    if (!nodes.has(sourceId)) nodes.set(sourceId, { id: sourceId, type: r.subject.type, label: r.subject.slug })
    if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, type: r.object.type, label: r.object.slug })
    edges.push({
      id: `${sourceId}|${r.predicate}|${targetId}`,
      source: sourceId,
      target: targetId,
      predicate: r.predicate,
    })
    predicados.set(r.predicate, (predicados.get(r.predicate) ?? 0) + 1)
  }
  return {
    nodes: [...nodes.values()],
    edges,
    predicates: [...predicados.entries()].map(([code, count]) => ({ code, count })),
  }
}

export class InMemoryGraphRepository implements GraphRepository {
  constructor(private readonly data: InMemoryDataset) {}

  async edgesOf(node: GraphNode): Promise<readonly Relationship[]> {
    return this.data.relationships.filter(
      (r) =>
        (r.subject.type === node.type && r.subject.slug === node.slug) ||
        (r.object.type === node.type && r.object.slug === node.slug),
    )
  }

  async neighbors(query: NeighborsQuery): Promise<readonly Relationship[]> {
    // Vecindad directa (profundidad 1) para la ficha de la UI.
    const directas = await this.edgesOf(query.node)
    return directas.filter((r) => !query.predicates || query.predicates.includes(r.predicate))
  }

  async paths(_from: GraphNode, _to: GraphNode, _maxDepth: number): Promise<readonly Path[]> {
    return []
  }

  /** Vecindad a profundidad N (BFS local; NET-HW-030). */
  async vecindad(node: GraphNode, maxDepth: number, predicates?: readonly string[]): Promise<UiGraphSubgraph> {
    const visitado = new Set<string>(`${node.type}:${node.slug}`)
    const frontera: GraphNode[] = [node]
    const acumulado: Relationship[] = []
    for (let depth = 0; depth < maxDepth && frontera.length > 0; depth++) {
      const actual = [...frontera]
      frontera.length = 0
      for (const nodo of actual) {
        const aristas = await this.edgesOf(nodo)
        for (const arista of aristas) {
          if (predicates && !predicates.includes(arista.predicate)) continue
          acumulado.push(arista)
          const peer = arista.subject.type === nodo.type && arista.subject.slug === nodo.slug ? arista.object : arista.subject
          const key = `${peer.type}:${peer.slug}`
          if (visitado.has(key)) continue
          visitado.add(key)
          if (depth < maxDepth - 1) frontera.push(peer)
        }
      }
    }
    return buildSubgraph(dedupImpl(acumulado))
  }

  /** Predicados incidentes a un nodo (para los filtros del mapa). */
  async predicadosDe(node: GraphNode): Promise<readonly { code: string; count: number }[]> {
    const aristas = await this.edgesOf(node)
    const counts = new Map<string, number>()
    for (const r of aristas) counts.set(r.predicate, (counts.get(r.predicate) ?? 0) + 1)
    return [...counts.entries()].map(([code, count]) => ({ code, count }))
  }

  /** Mapa global agregado por categoría (NET-HW-036): nodos = categorías con conteo. */
  async mapaGlobal(): Promise<UiGraphSubgraph> {
    return { nodes: this.nodosPorCategoria(), edges: this.aristasEntreCategorias(), predicates: [] }
  }

  /** Categorías con su número de dispositivos, de mayor a menor. */
  private nodosPorCategoria(): UiGraphNode[] {
    const catName = new Map(this.data.categories.map((c) => [c.code, c.nameEs]))
    const conteoCat = new Map<string, number>()
    for (const d of this.data.devices) conteoCat.set(d.categoryCode, (conteoCat.get(d.categoryCode) ?? 0) + 1)
    return [...conteoCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => ({
        id: `category:${code}`,
        type: 'category',
        label: `${catName.get(code) ?? code} (${n})`,
      }))
  }

  /** Aristas agregadas entre categorías (nº de enlaces dispositivo↔dispositivo). */
  private aristasEntreCategorias(): UiGraphEdge[] {
    const catDe = new Map(this.data.devices.map((d) => [d.slug.value, d.categoryCode]))
    const entreCategorias = new Map<string, { a: string; b: string; n: number }>()
    for (const r of this.data.relationships) {
      if (r.subject.type !== 'device' || r.object.type !== 'device') continue
      const a = catDe.get(r.subject.slug)
      const b = catDe.get(r.object.slug)
      if (!a || !b || a === b) continue
      const [x, y] = a < b ? [a, b] : [b, a]
      const key = `${x}|${y}`
      const actual = entreCategorias.get(key) ?? { a: x, b: y, n: 0 }
      actual.n++
      entreCategorias.set(key, actual)
    }
    return [...entreCategorias.values()].map(({ a, b, n }) => ({
      id: `category:${a}|category:${b}|n${n}`,
      source: `category:${a}`,
      target: `category:${b}`,
      predicate: `${n} enlace${n > 1 ? 's' : ''} entre categorías`,
    }))
  }
}

function dedupImpl(rels: readonly Relationship[]): Relationship[] {
  const unicos = new Map<string, Relationship>()
  for (const r of rels) {
    const k = `${r.subject.type}:${r.subject.slug}|${r.predicate}|${r.object.type}:${r.object.slug}`
    if (!unicos.has(k)) unicos.set(k, r)
  }
  return [...unicos.values()]
}
