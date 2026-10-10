import React from 'react'
import type { ComparisonReport } from '@netatlas/domain'

/** Fila de la tabla del comparador: insignias ▲/▼ y detalle plegable (F5). */
export function FilaComparacion({
  fila,
  expandida,
  onToggle,
}: {
  fila: ComparisonReport['rows'][number]
  expandida: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <React.Fragment>
      <tr>
        <th scope="row" style={{ fontWeight: 'normal' }}>
          <button type="button" onClick={onToggle} aria-expanded={expandida} className="mono guia-tecnica" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            {expandida ? '▾' : '▸'} {fila.labelEs}
            {fila.unit ? <span> ({fila.unit})</span> : null}
            {!fila.common ? <span aria-label="atributo específico"> *</span> : null}
          </button>
        </th>
        {fila.values.map((v) => (
          <td key={v.deviceSlug} className="mono" data-testid={`celda-${fila.key}-${v.deviceSlug}`}>
            {v.display}
            {v.isBest ? <span role="img" aria-label="mejor valor" title="Mejor valor según la regla" data-testid={`best-${fila.key}`}> ▲</span> : null}
            {v.lossReason ? <span aria-hidden="true" title={v.lossReason} style={{ color: 'var(--conf-third-party, #d29922)' }}> ▼</span> : null}
          </td>
        ))}
      </tr>
      {expandida ? (
        <tr>
          <td colSpan={fila.values.length + 1} className="guia-tecnica">
            {fila.values.filter((v) => v.lossReason).map((v) => <p key={v.deviceSlug} style={{ margin: '2px 0' }}>{v.lossReason}</p>)}
            {fila.values.every((v) => !v.lossReason) ? <p style={{ margin: 0 }}>Sin pérdidas frente al mejor valor: todos los candidatos coinciden o no aplica regla numérica.</p> : null}
          </td>
        </tr>
      ) : null}
    </React.Fragment>
  )
}
