import React from 'react'
import { Link } from 'react-router-dom'
import type { UiGraphSubgraph } from '../adapters/in-memory-tipos.js'
import { separarConteo } from './mapa-global-logica.js'

/**
 * Alternativa accesible del mapa global (NET-HW-036): las mismas categorías y
 * relaciones del grafo, en dos tablas para quien no puede usar el canvas.
 */

type Props = { readonly subgrafo: UiGraphSubgraph }

/** Tabla accesible de categorías con su conteo de dispositivos. */
export function CategoriasAccesibles({ subgrafo }: Props): React.JSX.Element {
  return (
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
  )
}

/** Tabla accesible de relaciones agregadas entre categorías. */
export function EnlacesAccesibles({ subgrafo }: Props): React.JSX.Element {
  return (
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
  )
}
