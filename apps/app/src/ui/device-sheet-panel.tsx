import React from 'react'
import { Link } from 'react-router-dom'
import { useDeviceRelations } from './device-sheet-hooks.js'
import { FrontPanel } from './front-panel.js'
import type { Relationship } from '@netatlas/domain'

/** Protocolos soportados (aristas supports-protocol), con enlace a cada ficha. */
export function ListaSoportes({ relaciones }: { relaciones: readonly Relationship[] }): React.JSX.Element {
  return (
    <p className="guia-tecnica">
      {relaciones.length > 0
        ? relaciones.slice(0, 6).map((r) => (
            <Link key={r.object.slug} to={`/protocolo/${r.object.slug}`} className="mono" style={{ marginRight: 6 }}>
              {r.object.slug}
            </Link>
          ))
        : 'Sin soportes curados.'}
    </p>
  )
}

/** Estándares implementados por el dispositivo. */
export function ListaEstandares({ relaciones }: { relaciones: readonly Relationship[] }): React.JSX.Element {
  return (
    <p className="guia-tecnica">
      {relaciones.length > 0 ? (
        relaciones.map((r) => <span key={r.object.slug} className="mono" style={{ marginRight: 6 }}>{r.object.slug}</span>)
      ) : (
        'Sin estándares curados.'
      )}
    </p>
  )
}

/** Panel contextual derecho (NET-HW-025): resumen de relaciones + panel frontal. */
export function PanelContextual({ device }: { device: import('@netatlas/domain').Device }): React.JSX.Element {
  const { relaciones } = useDeviceRelations(device)
  const soportes = relaciones.filter((r) => r.predicate === 'supports-protocol')
  const estandares = relaciones.filter((r) => r.predicate === 'implements-standard')

  return (
    <aside aria-label="Panel contextual" className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Panel frontal</h2>
      <FrontPanel ports={device.ports} />

      <h3 style={{ fontSize: 'var(--font-size-sm)', marginTop: 16 }}>Soportes ({soportes.length})</h3>
      <ListaSoportes relaciones={soportes} />

      <h3 style={{ fontSize: 'var(--font-size-sm)', marginTop: 12 }}>Estándares ({estandares.length})</h3>
      <ListaEstandares relaciones={estandares} />

      <p style={{ marginTop: 12 }}>
        <Link to="/glosario" className="guia-tecnica">Glosario técnico →</Link>
      </p>
    </aside>
  )
}
