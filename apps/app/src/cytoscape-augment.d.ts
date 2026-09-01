/**
 * Aumentaciones al núcleo de cytoscape (archivo módulo para que se fusionen
 * con @types/cytoscape).
 */
declare module 'cytoscape' {
  interface Core {
    /** Devuelve el grafo como documento SVG (requiere cytoscape-svg registrada). */
    svg(options?: { scale?: number; full?: boolean }): string
  }
}

export {}