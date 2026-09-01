import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'
import type { UiGraphSubgraph } from '../composition-root.js'
import { CytoscapeCanvas } from './cytoscape-canvas.js'
import { Breadcrumbs } from './breadcrumbs.js'

/**
 * Mapa global del conocimiento con agregación por categoría (NET-HW-036, §13.2):
 * nodos = categorías (con conteo de dispositivos), aristas = relaciones
 * device-device agregadas entre categorías. Click en un nodo → explorador.
 */
export function MapaGlobal(): React.JSX.Element {
  const navegar = useNavigate()
  const [subgrafo, setSubgrafo] = React.useState<UiGraphSubgraph | undefined>()

  React.useEffect(() => {
    void (async () => {
      const { graph } = useServices.getState().services
      setSubgrafo(await graph.mapaGlobal())
    })()
  }, [])

  if (!subgrafo) return <p role="status">Calculando mapa global…</p>

  const elements = [
    ...subgrafo.nodes.map((n) => ({ data: { id: n.id, label: n.label, tipo: n.type, pos: undefined } })),
    ...subgrafo.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.predicate } })),
  ]

  return (
    <section aria-labelledby="titulo-mapa-global">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Topologías', to: '/topologies' },
          { label: 'Mapa global' },
        ]}
      />
      <h1 id="titulo-mapa-global">Mapa global del conocimiento</h1>
      <p className="guia-tecnica">
        Todo el catálogo agregado por categoría: cada nodo es una macrocategoría con su número de
        dispositivos; las aristas cuentan las relaciones device↔device entre categorías. Haz clic en un
        nodo para ver sus dispositivos en el explorador.
      </p>

      <CytoscapeCanvas
        elements={elements}
        layout="cose"
        onTapNode={(id) => {
          if (id.startsWith('category:')) navegar(`/explore?cat=${id.slice('category:'.length)}`)
        }}
        ariaLabel={`Mapa global: ${subgrafo.nodes.length} categorías y ${subgrafo.edges.length} relaciones entre categorías`}
        testId="canvas-mapa-global"
      />

      <details className="guia-tecnica">
        <summary>Alternativa accesible (categorías y enlaces como tabla)</summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Dispositivos</th>
              </tr>
            </thead>
            <tbody>
              {subgrafo.nodes.map((n) => {
                const [label, conteo] = separarConteo(n.label)
                return (
                  <tr key={n.id}>
                    <td>
                      <Link to={`/explore?cat=${n.id.slice('category:'.length)}`}>{label}</Link>
                    </td>
                    <td className="mono">{conteo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Entre categorías</th>
                <th scope="col">Enlaces</th>
              </tr>
            </thead>
            <tbody>
              {subgrafo.edges.map((e) => (
                <tr key={e.id}>
                  <td className="mono">
                    {e.source.slice('category:'.length)} ↔ {e.target.slice('category:'.length)}
                  </td>
                  <td className="mono">{e.predicate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/** Separa «Nombre (42)» en [Nombre, 42]. */
function separarConteo(label: string): [string, string] {
  const m = /^(.*)\s+\((\d+)\)$/.exec(label)
  return m ? [m[1]!, m[2]!] : [label, '—']
}