import React from 'react'
import cytoscape from 'cytoscape'
import svgExtension from 'cytoscape-svg'
import type { Core, LayoutOptions, StylesheetJson } from 'cytoscape'

// Registra la extensión de exportación SVG (NET-HW-037) una sola vez.
cytoscape.use(svgExtension)

/**
 * Canvas Cytoscape reutilizable (F4, NET-HW-033/036/037): crea la instancia,
 * inyecta elementos con posiciones preset, conecta tap/dragfree y destruye en
 * cleanup. Las vistas (visor de topologías, mapa global) aportan elementos,
 * estilo y handlers.
 */

export interface CyElement {
  readonly data: Record<string, unknown>
}

export interface CytoscapeCanvasProps {
  readonly elements: readonly CyElement[]
  readonly layout?: string | LayoutOptions
  readonly style?: StylesheetJson | undefined
  readonly height?: number
  /** Id de nodo pulsado (o undefined). */
  onTapNode?: (id: string) => void
  /** Posiciones de todos los nodos al terminar de arrastrar. */
  onDragfree?: (positions: ReadonlyArray<{ id: string; x: number; y: number }>) => void
  /** Instancia Cytoscape lista (para exportar y animar). */
  onReady?: (cy: Core) => void
  readonly ariaLabel?: string
  readonly testId?: string
}

export function CytoscapeCanvas({
  elements,
  layout = 'preset',
  style,
  height = 460,
  onTapNode,
  onDragfree,
  onReady,
  ariaLabel,
  testId = 'cytoscape-canvas',
}: CytoscapeCanvasProps): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!ref.current) return
    const layoutOpts: LayoutOptions =
      typeof layout === 'string' ? ({ name: layout, directed: true, spacingFactor: 1.15 } as LayoutOptions) : layout
    const cy: Core = cytoscape({
      container: ref.current,
      elements: elements.map((e) => ({ data: { ...e.data } })),
      layout: layoutOpts,
      style:
        style ??
        [
          { selector: 'node', style: { label: 'data(label)', 'font-size': 9, 'text-valign': 'bottom', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '110px', color: 'var(--text-secondary)', 'background-color': '#6e7681', width: 28, height: 28 } },
          { selector: 'node[tipo = "device"]', style: { 'background-color': '#238636' } },
          { selector: 'node[tipo = "category"]', style: { 'background-color': '#8957e5' } },
          { selector: 'node[?foco]', style: { 'border-width': 3, 'border-color': '#f0b429' } },
          { selector: '.enRuta', style: { 'background-color': '#f0b429', 'border-width': 0 } },
          { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'line-color': '#484f58', 'target-arrow-color': '#484f58', label: 'data(label)', 'font-size': 7, 'text-rotation': 'autorotate', color: '#8b949e' } },
          { selector: 'edge.enRuta', style: { 'line-color': '#f0b429', 'target-arrow-color': '#f0b429' } },
        ],
    })
    cy.nodes().forEach((n) => {
      const pos = n.data('pos')
      if (pos) n.position({ x: pos.x, y: pos.y })
    })
    onReady?.(cy)
    if (onTapNode) {
      cy.on('tap', 'node', (evt) => onTapNode(evt.target.id()))
    }
    if (onDragfree) {
      cy.on('dragfree', 'node', () => {
        onDragfree(
          cy.nodes().map((n) => ({ id: n.id(), x: n.position('x'), y: n.position('y') })),
        )
      })
    }
    return () => {
      cy.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements])

  return (
    <div
      ref={ref}
      data-testid={testId}
      role="img"
      aria-label={ariaLabel ?? `Grafo con ${elements.filter((e) => e.data.source === undefined).length} nodos`}
      style={{ height, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-inset)' }}
    />
  )
}