import React from 'react'
import type { FacetaUI } from './explore-carga.js'

/**
 * Panel de facetas dinámicas por atributo (F3): un grupo (fieldset) por
 * atributo facetado de la categoría, con conmutadores y limpieza.
 */
export function FacetasPanel({
  facetas,
  seleccion,
  onToggle,
  onLimpiar,
  activas,
}: {
  facetas: readonly FacetaUI[]
  seleccion: Readonly<Record<string, readonly string[]>>
  onToggle: (key: string, valor: string) => void
  onLimpiar: () => void
  activas: number
}): React.JSX.Element {
  if (facetas.length === 0) {
    return (
      <p className="guia-tecnica" style={{ marginTop: 12 }}>
        Esta categoría no tiene atributos facetados curados (EAV §9.4).
      </p>
    )
  }
  return (
    <aside aria-label="Filtros dinámicos por atributo" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>Filtros dinámicos</h2>
        {activas > 0 ? (
          <button type="button" onClick={onLimpiar} className="guia-tecnica" style={{ fontSize: 'var(--font-size-xs)' }}>
            Limpiar ({activas})
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {facetas.map((f) => (
          <fieldset key={f.key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', margin: 0, minWidth: 170 }}>
            <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>
              {f.labelEs}
              {f.unit ? <span className="mono"> ({f.unit})</span> : null}
            </legend>
            <div className="row" role="group" aria-label={f.labelEs} style={{ flexWrap: 'wrap' }}>
              {f.conteos.map((c) => {
                const activo = (seleccion[f.key] ?? []).includes(c.value)
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => onToggle(f.key, c.value)}
                    className="mono"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px' }}
                  >
                    {c.value} <span aria-hidden="true">·{c.count}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </aside>
  )
}
