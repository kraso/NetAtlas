import type { Topology } from '@netatlas/domain'

/**
 * Modelo de presentación para topologías (F4): traducción a elementos de
 * Cytoscape, rutas (flujo de paquetes, NET-HW-035) y capas presentes.
 */

export interface TopologyElement {
  readonly data: Record<string, unknown>
}

/** Nodos y aristas de una topología en el formato de Cytoscape. */
export function elementosDeTopologia(t: Topology): TopologyElement[] {
  const nodos = t.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.entitySlug,
      tipo: n.entityType,
      layer: n.layerHint,
      pos: n.x !== undefined && n.y !== undefined ? { x: n.x, y: n.y } : undefined,
    },
  }))
  const aristas = t.edges.map((e) => ({
    data: {
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label ?? (e.linkKind !== 'link' ? e.linkKind : undefined),
      predicate: e.linkKind ?? 'link',
    },
  }))
  return [...nodos, ...aristas]
}

/** Capas OSI presentes en la topología (para el filtro por capa, NET-HW-033). */
export function capasDe(t: Topology): readonly number[] {
  return [...new Set(t.nodes.map((n) => n.layerHint).filter((l): l is number => l !== undefined))].sort((a, b) => a - b)
}

/**
 * Ruta no dirigida más corta entre dos nodos (BFS sobre las aristas de la
 * topología). Devuelve la lista de ids de nodo visitados, incluidos extremos.
 * Se usa para el flujo de paquetes animado (NET-HW-035).
 */
export function rutaTopologia(t: Topology, fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId]
  const adyacentes = new Map<string, string[]>()
  for (const n of t.nodes) adyacentes.set(n.id, [])
  for (const e of t.edges) {
    adyacentes.get(e.from)?.push(e.to)
    adyacentes.get(e.to)?.push(e.from)
  }
  const visitado = new Set<string>([fromId])
  const cola: { id: string; ruta: string[] }[] = [{ id: fromId, ruta: [fromId] }]
  while (cola.length > 0) {
    const actual = cola.shift()!
    for (const vecino of adyacentes.get(actual.id) ?? []) {
      if (visitado.has(vecino)) continue
      visitado.add(vecino)
      const ruta = [...actual.ruta, vecino]
      if (vecino === toId) return ruta
      cola.push({ id: vecino, ruta })
    }
  }
  return []
}

/** Convierte los elementos a su representación textual (alternativa accesible). */
export function tablaDeTopologia(t: Topology): { nodos: string[][]; aristas: string[][] } {
  return {
    nodos: t.nodes.map((n) => [n.entityType, n.entitySlug, String(n.layerHint ?? '—'), `${n.x ?? '—'}, ${n.y ?? '—'}`]),
    aristas: t.edges.map((e) => [e.from, e.to, e.label ?? e.linkKind, e.linkKind]),
  }
}