import React from 'react'
import type { Topology } from '@netatlas/domain'
import { tablaDeTopologia } from './topology-model.js'

/** Alternativa accesible del visor: nodos y enlaces como dos tablas (NET-HW-026). */
export function TablaTopologia({ topologia }: { topologia: Topology }): React.JSX.Element {
  const { nodos, aristas } = tablaDeTopologia(topologia)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
      <table className="tabla-specs">
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Entidad</th>
            <th scope="col">Capa</th>
            <th scope="col">Posición</th>
          </tr>
        </thead>
        <tbody>
          {nodos.map(([tipo, entidad, capa, pos]) => (
            <tr key={`${tipo}-${entidad}`}>
              <td className="mono">{tipo}</td>
              <td className="mono">{entidad}</td>
              <td className="mono">{capa}</td>
              <td className="mono">{pos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tabla-specs">
        <thead>
          <tr>
            <th scope="col">Origen</th>
            <th scope="col">Destino</th>
            <th scope="col">Etiqueta</th>
          </tr>
        </thead>
        <tbody>
          {aristas.map(([from, to, label]) => (
            <tr key={`${from}-${to}`}>
              <td className="mono">{from}</td>
              <td className="mono">{to}</td>
              <td className="mono">{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
