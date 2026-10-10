import React from 'react'
import { Link } from 'react-router-dom'
import type { ComparisonReport } from '@netatlas/domain'
import { FilaComparacion } from './comparar-fila.js'

/**
 * Informe del comparador (F5 / §18): aviso transversal, modo «solo
 * diferencias», tabla por atributos con quitar candidato, atributos
 * específicos, compatibilidades curadas/declarativas y veredicto
 * determinista (NET-HW-040/041).
 */
export interface InformeComparacionProps {
  readonly report: ComparisonReport
  readonly soloDiferencias: boolean
  readonly onSoloDiferencias: (valor: boolean) => void
  readonly expandidas: ReadonlySet<string>
  readonly onToggleFila: (key: string) => void
  readonly onQuitar: (slug: string) => void
}

export function InformeComparacion(props: InformeComparacionProps): React.JSX.Element {
  const { report, soloDiferencias, onSoloDiferencias, expandidas, onToggleFila, onQuitar } = props
  const visibles = soloDiferencias ? report.rows.filter((r) => !r.allEqual) : report.rows

  return (
    <div className="stack">
      {report.transversal ? (
        <p role="note" className="empty-state">
          Comparación transversal entre categorías: solo las filas comunes se comparan;{' '}
          {report.atributosEspecificos} atributo{report.atributosEspecificos === 1 ? '' : 's'} específico
          {report.atributosEspecificos === 1 ? '' : 's'} no entran en la tabla.
        </p>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={soloDiferencias} onChange={(e) => onSoloDiferencias(e.target.checked)} aria-label="Modo solo diferencias" />
          Solo diferencias ({report.filasConDiferencias})
        </label>
        <span className="guia-tecnica">▲ mejor valor · ▼ limitación (según regla del atributo)</span>
      </div>

      {visibles.length === 0 ? (
        <p className="empty-state">
          {soloDiferencias ? 'No hay diferencias entre los candidatos con los datos comparados.' : 'Sin atributos comunes que comparar.'}
        </p>
      ) : (
        <table className="tabla-specs">
          <thead>
            <tr>
              <th scope="col">Atributo</th>
              {report.devices.map((d) => (
                <th scope="col" key={d.slug}>
                  <Link to={`/device/${d.slug}`}>{d.name}</Link>
                  <button type="button" onClick={() => onQuitar(d.slug)} aria-label={`Quitar ${d.name}`} className="mono guia-tecnica" style={{ marginLeft: 6 }}>✕</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <FilaComparacion key={r.key} fila={r} expandida={expandidas.has(r.key)} onToggle={() => onToggleFila(r.key)} />
            ))}
          </tbody>
        </table>
      )}

      {report.especificas.length > 0 ? (
        <p className="guia-tecnica">
          Atributos específicos no comparados: <span className="mono">{report.especificas.map((e) => `${e.labelEs} (${e.key})`).join(' · ')}</span>
        </p>
      ) : null}

      {report.compatibilidades.length > 0 ? (
        <section aria-label="Compatibilidades e incompatibilidades">
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Compatibilidad entre candidatos</h2>
          <ul>
            {report.compatibilidades.map((c, i) => (
              <li key={`${c.a}-${c.b}-${i}`} className={c.compatible ? '' : 'empty-state'} style={{ margin: 0 }}>
                <span className="mono">{c.a} ↔ {c.b}</span>: {c.note ?? (c.compatible ? 'compatibles' : 'incompatibles')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Veredicto" className="card">
        <h2 style={{ fontSize: 'var(--font-size-md)' }}>Veredicto</h2>
        <ul>
          {report.veredicto.map((v, i) => (
            <li key={i} style={{ margin: '2px 0' }}>{v}</li>
          ))}
        </ul>
        <p className="guia-tecnica" role="note">
          Síntesis determinista por plantilla (sin IA ni puntuación global): la ponderación la decide el usuario.
        </p>
      </section>
    </div>
  )
}
