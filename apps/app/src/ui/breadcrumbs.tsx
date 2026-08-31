import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useHistoriaStore } from '../viewmodels/history-store.js'

/**
 * Migas relacionales + historial de ruta (NET-HW-025).
 * Cadena de navegación + botón "volver" que retrocede por el historial de
 * sesión (además del retroceso nativo del navegador).
 */
export interface MigasItem {
  readonly label: string
  readonly to?: string
}

export function Breadcrumbs({ items }: { items: readonly MigasItem[] }): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const registrar = useHistoriaStore((s) => s.registrar)
  const retroceder = useHistoriaStore((s) => s.retroceder)

  React.useEffect(() => {
    registrar(items[items.length - 1]?.label ?? 'NetAtlas', location.pathname + location.search)
  }, [location.pathname, location.search, registrar, items])

  const volver = (): void => {
    const destino = retroceder()
    if (destino) navigate(destino)
  }

  return (
    <nav aria-label="Migas de pan y navegación" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {i > 0 ? <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>/</span> : null}
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </React.Fragment>
      ))}

      <button
        type="button"
        style={{ marginLeft: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', padding: '2px 8px', cursor: 'pointer' }}
        onClick={volver}
      >
        ← Volver
      </button>
    </nav>
  )
}