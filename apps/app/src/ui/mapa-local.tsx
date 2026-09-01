import React from 'react'
import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import { useServices } from '../composition-root.js'
import type { UiGraphSubgraph } from '../composition-root.js'
import type { Device } from '@netatlas/domain'

/**
 * Mapa local del grafo NET-HW-030 (F3): vecindad multi-salto de un dispositivo
 * renderizada con Cytoscape.js, con filtros por predicado. La pestaña
 * Diagramas de la ficha lo aloja; profundidad 2 (vecindad + second hop).
 */

const PROFUNDIDAD = 2

/** Etiqueta castellana de cada predicado canónico (misma fuente que §8.3). */
const ETIQUETA_PREDICADO: Readonly<Record<string, string>> = {
  'manufactured-by': 'Fabricado por',
  'belongs-to-family': 'Familia',
  'has-category': 'Categoría',
  'has-role-category': 'Clasificación',
  'supports-protocol': 'Soporta protocolo',
  'implements-standard': 'Implementa estándar',
  'uses-technology': 'Usa tecnología',
  'operates-at-layer': 'Opera en capa',
  'terminates-medium': 'Termina medio',
  'compatible-with': 'Compatible con',
  'succeeds': 'Sucede a',
  'precedes': 'Precede a',
  'replaced-by': 'Reemplazado por',
  'similar-to': 'Similar a',
  'evolves-into': 'Evoluciona a',
  'uses-interface': 'Usa interfaz',
}

export function MapaLocal({ device }: { device: Device }): React.JSX.Element {
  const [subgrafo, setSubgrafo] = React.useState<UiGraphSubgraph | undefined>()
  const [preds, setPreds] = React.useState<readonly { code: string; count: number }[]>([])
  const [activos, setActivos] = React.useState<readonly string[]>([])
  const [cargando, setCargando] = React.useState(true)

  const nodo = { type: 'device', slug: device.slug.value }
  const activosKey = activos.slice().sort().join('|')

  React.useEffect(() => {
    void (async () => {
      setCargando(true)
      const { graph } = useServices.getState().services
      const sg = await graph.vecindad(nodo, PROFUNDIDAD, activos.length > 0 ? activos : undefined)
      setSubgrafo(sg)
      // Fija la lista de predicados disponibles en la primera carga (sin filtro).
      if (activos.length === 0) setPreds(sg.predicates)
      setCargando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.slug.value, activosKey])

  const toggle = (code: string): void => {
    setActivos((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  if (cargando && !subgrafo) return <p role="status">Cargando mapa local…</p>
  if (!subgrafo || subgrafo.nodes.length === 0) {
    return <p className="empty-state">Sin relaciones curadas para el mapa local (grafo §9.5).</p>
  }

  return (
    <div className="stack">
      <p className="guia-tecnica">
        Mapa local de vecindad (≤{PROFUNDIDAD} saltos) sobre el grafo de conocimiento §9.5.
      </p>

      {preds.length > 0 ? (
        <fieldset aria-label="Filtros por predicado" className="card" style={{ margin: 0, padding: '8px 12px' }}>
          <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>Filtros por predicado</legend>
          <div className="row" role="group" aria-label="Predicados del mapa" style={{ flexWrap: 'wrap' }}>
            {preds.map((p) => (
              <label key={p.code} className="mono" style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={activos.includes(p.code)}
                  onChange={() => toggle(p.code)}
                  aria-label={`${ETIQUETA_PREDICADO[p.code] ?? p.code} (${p.count})`}
                />
                {ETIQUETA_PREDICADO[p.code] ?? p.code}
                <span aria-hidden="true">·{p.count}</span>
              </label>
            ))}
          </div>
          {activos.length > 0 ? (
            <button type="button" onClick={() => setActivos([])} style={{ fontSize: 'var(--font-size-xs)', marginTop: 6 }}>
              Mostrar todas las relaciones
            </button>
          ) : null}
        </fieldset>
      ) : null}

      <CytoscapeMap subgrafo={subgrafo} />

      <p className="guia-tecnica" role="note">
        {subgrafo.nodes.length} nodos · {subgrafo.edges.length} aristas
        {activos.length > 0 ? ` (filtradas por ${activos.length} predicado${activos.length > 1 ? 's' : ''})` : ''}
      </p>
    </div>
  )
}

/** Render del lienzo Cytoscape; se regenera con cada subgrafo. */
function CytoscapeMap({ subgrafo }: { subgrafo: UiGraphSubgraph }): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!ref.current) return
    const cy: Core = cytoscape({
      container: ref.current,
      elements: [
        ...subgrafo.nodes.map((n) => ({ data: { id: n.id, label: n.label, tipo: n.type } })),
        ...subgrafo.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, predicate: e.predicate } })),
      ],
      layout: { name: 'breadthfirst', directed: true, spacingFactor: 1.15 },
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 10, 'text-valign': 'bottom', 'text-halign': 'center', 'text-wrap': 'ellipsis', 'text-max-width': '90px', color: 'var(--text-secondary)', 'background-color': '#6e7681', width: 26, height: 26 } },
        { selector: 'node[tipo = "device"]', style: { 'background-color': '#238636' } },
        { selector: 'node[tipo = "category"]', style: { 'background-color': '#8957e5' } },
        { selector: 'node[tipo = "protocol"]', style: { 'background-color': '#1f6feb' } },
        { selector: 'node[tipo = "standard"]', style: { 'background-color': '#d29922' } },
        { selector: 'node[tipo = "manufacturer"]', style: { 'background-color': '#3d8f9e' } },
        { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'line-color': '#484f58', 'target-arrow-color': '#484f58', label: 'data(predicate)', 'font-size': 8, 'text-rotation': 'autorotate', color: '#8b949e' } },
      ],
    })
    return () => {
      cy.destroy()
    }
  }, [subgrafo])

  return (
    <div
      ref={ref}
      data-testid="mapa-local"
      role="img"
      aria-label={`Mapa local: ${subgrafo.nodes.length} nodos y ${subgrafo.edges.length} aristas del grafo de conocimiento`}
      style={{ height: 460, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-inset)' }}
    />
  )
}