/** Tipos de extremo permitidos en las aristas del grafo. */
export const NODE_TYPES = [
  'device',
  'manufacturer',
  'product-family',
  'category',
  'interface',
  'port',
  'protocol',
  'standard',
  'technology',
  'medium',
  'component',
  'layer',
  'firmware',
  'topology',
  'speed-grade',
] as const

export type NodeType = (typeof NODE_TYPES)[number]

export function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value)
}

/** Un nodo del grafo: (type, slug). */
export interface GraphNode {
  readonly type: NodeType
  readonly slug: string
}

export function graphNodeId(node: GraphNode): string {
  return `${node.type}:${node.slug}`
}
