import React from 'react'

/**
 * Barra superior del comparador (F5 / NET-HW-040/042): buscador con
 * sugerencias, exportación CSV/PDF, enlace compartible verificado (F5
 * refinamiento) y sus estados «verificado» / «el dataset ha cambiado».
 */
export interface BarraCompararProps {
  readonly busqueda: string
  readonly onBusqueda: (valor: string) => void
  readonly sugerencias: readonly { slug: string; label: string }[]
  readonly onAñadir: (slug: string) => void
  readonly onExportarCsv: () => void
  readonly onExportarPdf: () => void
  readonly onCopiarEnlace: () => void
  readonly enlaceCopiado: boolean
  readonly reporteListo: boolean
  readonly etiquetaUrl: string | null
  readonly enlaceVerificado: boolean
}

export function BarraComparar(props: BarraCompararProps): React.JSX.Element {
  const { busqueda, onBusqueda, sugerencias, onAñadir, onExportarCsv, onExportarPdf, onCopiarEnlace, enlaceCopiado, reporteListo, etiquetaUrl, enlaceVerificado } = props
  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="sr-only" htmlFor="buscar-comparar">Añadir dispositivo</label>
        <input
          id="buscar-comparar"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Añadir dispositivo por nombre o slug…"
          className="search-input"
          data-testid="buscar-comparar"
        />
        <button type="button" onClick={onExportarCsv}>Exportar CSV</button>
        <button type="button" onClick={onExportarPdf}>Exportar PDF</button>
        <button type="button" onClick={onCopiarEnlace} disabled={!reporteListo}>
          {enlaceCopiado ? 'Enlace copiado ✓' : 'Copiar enlace del reporte'}
        </button>
        {enlaceVerificado ? (
          <span className="mono guia-tecnica" data-testid="enlace-verificado" role="status">
            ✓ enlace verificado (mismo veredicto)
          </span>
        ) : etiquetaUrl !== null && reporteListo ? (
          <span className="empty-state" data-testid="enlace-cambiado" role="status">
            El dataset ha cambiado desde que se generó este enlace: el veredicto puede diferir.
          </span>
        ) : null}
      </div>
      {sugerencias.length > 0 ? (
        <ul aria-label="Sugerencias" style={{ listStyle: 'none', margin: '4px 0', padding: 0 }}>
          {sugerencias.map((s) => (
            <li key={s.slug}>
              <button type="button" onClick={() => onAñadir(s.slug)} className="mono guia-tecnica">
                + {s.label} ({s.slug})
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
