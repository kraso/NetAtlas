import React from 'react'
import { ConfidenceBadge, confidenceLabel } from '@netatlas/ui'
import { Empty, urlDeBundle } from './device-sheet-piezas.js'
import { Genealogia } from './genealogia.js'
import type { DatosPestana } from './device-sheet-hooks.js'

type Ficha = import('@netatlas/domain').Datasheet
type Assertion = import('@netatlas/domain').Assertion

// El mapa local (Cytoscape) solo se carga al abrir la pestaña Diagramas.
const MapaLocal = React.lazy(() => import('./mapa-local.js').then((m) => ({ default: m.MapaLocal })))

export function TabDiagramas({ datos }: { datos: DatosPestana }): React.JSX.Element {
  return (
    <React.Suspense fallback={<p role="status">Cargando mapa local…</p>}>
      <MapaLocal device={datos.device} />
    </React.Suspense>
  )
}

export function TabHistoria({ datos }: { datos: DatosPestana }): React.JSX.Element {
  return <Genealogia device={datos.device} />
}

/** Ficha documental: la copia local del bundle manda; la web es la procedencia. */
function FichaDatasheet({ ficha }: { ficha: Ficha }): React.JSX.Element {
  return (
    <li>
      {/* La copia local manda: es la que la app sirve siempre, sin red.
          La web queda como enlace secundario de procedencia. */}
      {ficha.localPath ? (
        <a href={urlDeBundle(ficha.localPath)} target="_blank" rel="noreferrer">{ficha.title}</a>
      ) : ficha.url ? (
        <a href={ficha.url} target="_blank" rel="noreferrer">{ficha.title}</a>
      ) : (
        <span>{ficha.title}</span>
      )}{' '}
      <span className="mono guia-tecnica">[{ficha.language}]</span>{' '}
      <span className="guia-tecnica">{ficha.source.title}</span>
      {ficha.localPath !== undefined ? (
        <>{' '}<span className="guia-tecnica">· copia local (offline)</span></>
      ) : null}
      {ficha.localPath !== undefined && ficha.url !== undefined ? (
        <>{' '}<a href={ficha.url} target="_blank" rel="noreferrer" className="guia-tecnica">fuente online</a></>
      ) : null}
    </li>
  )
}

export function TabDocumentacion({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { fichas } = datos
  if (fichas.length === 0) return <Empty message="Datasheets y documentación de la ficha pendientes (F2)." />
  return (
    <ul>
      {fichas.map((f) => (
        <FichaDatasheet key={`${f.title}-${f.language}`} ficha={f} />
      ))}
    </ul>
  )
}

/** Fila de la tabla de trazabilidad (predicado · valor · fuente · confianza). */
function FilaReferencia({ assertion }: { assertion: Assertion }): React.JSX.Element {
  return (
    <tr>
      <td className="mono">{assertion.predicate}</td>
      <td className="mono">{assertion.valueJson}</td>
      <td>
        {confidenceLabel(assertion.confidence)}
        <ConfidenceBadge confidence={assertion.confidence} size="sm" />
        {assertion.reviewedBy ? null : <span className="guia-tecnica"> · pendiente revisión</span>}
      </td>
      <td className="mono">{assertion.source.title}</td>
      <td className="mono">{assertion.verifiedOn}</td>
    </tr>
  )
}

export function TabReferencias({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { assertions } = datos
  if (assertions.length === 0) return <Empty message="Sin afirmaciones curadas con fuente." />
  return (
    <table className="tabla-specs">
      <thead>
        <tr>
          <th scope="col">Predicado</th>
          <th scope="col">Valor</th>
          <th scope="col">Fuente</th>
          <th scope="col">Confianza</th>
          <th scope="col">Verificado</th>
        </tr>
      </thead>
      <tbody>
        {assertions.map((a, i) => (
          <FilaReferencia key={`${a.predicate}-${i}`} assertion={a} />
        ))}
      </tbody>
    </table>
  )
}
