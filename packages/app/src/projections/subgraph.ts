/**
 * Proyección de relaciones del dominio → formato UI (nodos, aristas, predicados).
 *
 * Extráida de apps/app/src/adapters/in-memory.ts (buildSubgraph).
 * Se vive en packages/app porque ambos casos de uso (local/global) lo comparten,
 * sin acoplar el dominio ni la infraestructura a esta proyección de vista.
 */
import type { Relationship } from '@netatlas/domain'

export interface UiGraphNode {
  readonly id: string
  readonly type: string
  readonly label: string
}

export interface UiGraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly predicate: string
}

export interface UiGraphSubgraph {
  readonly nodes: readonly UiGraphNode[]
  readonly edges: readonly UiGraphEdge[]
  readonly predicates: readonly { code: string; count: number }[]
}

export function buildSubgraph(relaciones: readonly Relationship[]): UiGraphSubgraph {
  const nodes = new Map<string, UiGraphNode>()
  const edges: UiGraphEdge[] = []
  const predicados = new Map<string, number>()
  for (const r of relaciones) {
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

export function dedup(rels: readonly Relationship[]): Relationship[] {
  const unicos = new Map<string, Relationship>()
  for (const r of rels) {
    const k = `${r.subject.type}:${r.subject.slug}|${r.predicate}|${r.object.type}:${r.object.slug}`
    if (!unicos.has(k)) unicos.set(k, r)
  }
  return [...unicos.values()]
}
