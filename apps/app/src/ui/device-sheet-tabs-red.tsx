import React from 'react'
import { Link } from 'react-router-dom'
import { Empty, SimilaresComparar } from './device-sheet-piezas.js'
import type { DatosPestana } from './device-sheet-hooks.js'

export function TabProtocolos({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { soportes } = datos
  if (soportes.length === 0) {
    return <Empty message="Sin protocolos curados (se alimenta de la arista supports-protocol)." />
  }
  return (
    <div className="stack">
      <ul>
        {soportes.map((r) => (
          <li key={r.object.slug}>
            <Link to={`/protocolo/${r.object.slug}`} className="mono">{r.object.slug}</Link>
          </li>
        ))}
      </ul>
      <p className="guia-tecnica">
        ¿Qué es un <Link to="/glosario/conmutador">conmutador</Link> o una{' '}
        <Link to="/glosario/vlan">VLAN</Link>? Ver el <Link to="/glosario">glosario técnico</Link>.
      </p>
    </div>
  )
}

export function TabEstandares({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { estandares } = datos
  if (estandares.length === 0) return <Empty message="Sin estándares implementados curados." />
  return (
    <ul>
      {estandares.map((r) => (
        <li key={r.object.slug}><span className="mono">{r.object.slug}</span></li>
      ))}
    </ul>
  )
}

export function TabCompatibilidad({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { device, medios, compatibles, similares } = datos
  return (
    <div className="stack">
      {medios.length > 0 ? (
        <p>
          Medios que termina:{' '}
          {medios.map((r) => <span key={r.object.slug} className="mono" style={{ marginRight: 8 }}>{r.object.slug}</span>)}
        </p>
      ) : null}
      {compatibles.length > 0 ? (
        <p>Compatible con: {compatibles.map((r) => r.object.slug).join(', ')}</p>
      ) : null}
      <SimilaresComparar deviceSlug={device.slug.value} similares={similares} />
      {compatibles.length === 0 && similares.length === 0 && medios.length === 0 ? (
        <Empty message="Compatibilidades curadas pendientes (aristas compatible-with / similar-to / requires)." />
      ) : null}
    </div>
  )
}
