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
  /** Posicion inicial (layout `preset`): si se aporta, el nodo nace ahi. */
  readonly position?: { readonly x: number; readonly y: number }
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
    // NET-HW-036: si el layout requiere layout (cose/cola... no preset), NO
    // dejamos que Cytoscape ejecute el layout en init sobre bounds 0×0 (colapsa
    // nodos en el origen → canvas blank). Usamos layout:false en init y
    // disparan el layout explícito en rAF tras el primer paint.
    const needsLayout = typeof layout === 'string' && layout !== 'preset'
    const initLayout = needsLayout ? false : (typeof layout === 'string' ? ({ name: layout, directed: true, spacingFactor: 1.15 } as LayoutOptions) : (layout ?? false))
    const cy: Core = cytoscape({
      container: ref.current,
      elements: elements.map((e) => {
        const { data, position, ...rest } = e as CyElement & { position?: { x: number; y: number } }
        const mapped: { data: Record<string, unknown>; position?: { x: number; y: number } } = { data: { ...data } }
        // Cytoscape necesita `position` en toplevel (NO dentro de data) para
        // layouts como `cose`/`preset`. buildSubgraph inyecta posiciones en data.pos.
        if (position) {
          mapped.position = { x: position.x, y: position.y }
        } else if (data.pos) {
          const pos = data.pos as { x: number; y: number }
          mapped.position = { x: pos.x, y: pos.y }
        } else if (data.x !== undefined && data.y !== undefined) {
          mapped.position = { x: data.x as number, y: data.y as number }
        }
        return mapped
      }),
      layout: initLayout as any,
      // Gestos nativos de Cytoscape (pan con fondo, zoom con rueda, drag de nodos):
      // no anadir handlers propios de mousedown/wheel: secuestran el drag de nodos.
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: true,
      wheelSensitivity: 0.3,
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
    // Marca del primer render efectivo (SLO §23.2): cytoscape dibuja en canvas,
    // así que la única señal DOM del layout+render es su evento 'render'.
    const inicio = performance.now()
    cy.one('render', () => {
      ref.current?.setAttribute('data-cy-render-ms', String(Math.round(performance.now() - inicio)))
    })
    onReady?.(cy)
    // NET-HW-036: el canvas overlay de Cytoscape (z-index 0, para eventos) se
    // renderiza con bg negro opaco, tapando el renderer principal (canvas[2])
    // aunque tenga nodes/edges pintados. Forzamos bg transparente en todos los
    // canvas hijos tras el primer paint (en el setTimeout) cuando ya existen.
    // NET-HW-036: el container puede no tener dimensiones reales al init
    // (el layout cose ejecuta sobre bounds 0×0 → colapsa nodos → canvas blank).
    // Forzamos resize + relayout en el tick siguiente al paint.
    // (rAF/setTimeout(0) es más fiable que rAF sólo en headless.)
    // Timers con cleanup: si el componente desmonta antes, no tocar la instancia.
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => {
      // Guardas typeof: en jsdom el mock de cytoscape no implementa estos metodos.
      if (typeof cy.destroyed === 'function' && cy.destroyed()) return
      if (typeof cy.resize === 'function') cy.resize()
      const container = ref.current
      if (!container) return
      // El canvas hijos existen ahora: forzamos bg transparente para destapar
      // el renderer principal (canvas[2]) del overlay negro Cytoscape-default.
      const canvases = container.querySelectorAll('canvas')
      canvases.forEach((c) => { (c.style as any).setProperty('background', 'transparent', 'important') })
      container.style.setProperty('background', 'transparent', 'important')
      if (needsLayout) {
        // cose necesita posiciones iniciales dispersas: usamos rand seed
        // (sin coordenadas iniciales cose colapsa → canvas blank).
        cy.nodes().forEach((n: any) => n.position({ x: Math.random() * 500 + 100, y: Math.random() * 380 + 40 }))
        const l = cy.layout({ name: layout as string, animate: false, animationDuration: 0, padding: 40 } as any)
        l.run()
        // Forzamos render explicito tras el layout + zoom-fit al bbox de elementos.
        timers.push(setTimeout(() => {
          try {
            if (typeof cy.destroyed === 'function' && cy.destroyed()) return
            if (typeof cy.fit === 'function') cy.fit(undefined, 40)
            ;(cy as any).render?.()
            ;(cy as any).redraw?.()
          } catch (e) { console.warn('[cytoscape] fit post-layout fallo', e) }
        }, 50))
      } else {
        // `preset`: posiciones ya calculadas por la vista; solo encuadrar al montar.
        cy.fit(undefined, 40)
      }
    }, 0))
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
      timers.forEach((t) => clearTimeout(t))
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