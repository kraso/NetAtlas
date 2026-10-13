import type { TopologyEdgeProps, TopologyNode, TopologyNodeProps } from '@netatlas/domain'

/**
 * Proyecciones inmutables entre la topología persistida y su formato de
 * construcción (`Topology.create`): las comparten visor (NET-HW-033) y
 * laboratorio (NET-HW-034).
 */

export function proyectarNodo(n: TopologyNode): TopologyNodeProps {
  return { entityType: n.entityType, entitySlug: n.entitySlug, x: n.x, y: n.y, layerHint: n.layerHint }
}

export function proyectarArista(e: { from: string; to: string; linkKind?: string; mediumCode?: string; label?: string }): TopologyEdgeProps {
  return { from: e.from, to: e.to, linkKind: e.linkKind, mediumCode: e.mediumCode, label: e.label }
}
