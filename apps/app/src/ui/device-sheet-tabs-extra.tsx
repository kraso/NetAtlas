import React from 'react'
import { ConfidenceBadge } from '@netatlas/ui'
import { Empty, datoGbps } from './device-sheet-piezas.js'
import type { UiDeviceAttributeValue } from '../composition-root.js'
import type { DatosPestana } from './device-sheet-hooks.js'

type Assertion = import('@netatlas/domain').Assertion

function TablaAtributos({ atributos }: { atributos: readonly UiDeviceAttributeValue[] }): React.JSX.Element {
  if (atributos.length === 0) {
    return <p className="empty-state">Sin atributos de categoría curados para este dispositivo (EAV §9.4).</p>
  }
  return (
    <table className="tabla-specs">
      <thead>
        <tr>
          <th scope="col">Atributo</th>
          <th scope="col">Valor</th>
          <th scope="col">Unidad</th>
        </tr>
      </thead>
      <tbody>
        {atributos.map((a) => (
          <tr key={a.key}>
            <td>{a.labelEs}</td>
            <td className="mono">{a.display}</td>
            <td className="mono">{a.unit ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Capacidad total de conmutación (assertion throughput_gbps). */
function CapacidadThroughput({ assertionDe }: { assertionDe: DatosPestana['assertionDe'] }): React.JSX.Element | null {
  const assertion = assertionDe('throughput_gbps')
  if (!assertion) return null
  return (
    <p>
      Capacidad total de conmutación: <span className="mono">{datoGbps(assertion)} Gbps</span>{' '}
      <ConfidenceBadge confidence={assertion.confidence} size="sm" />
    </p>
  )
}

/** Consumo eléctrico (assertion power_consumption_w). */
function ConsumoEnergia({ assertionDe }: { assertionDe: DatosPestana['assertionDe'] }): React.JSX.Element | null {
  const assertion = assertionDe('power_consumption_w')
  if (!assertion) return null
  return (
    <p>
      Consumo: <span className="mono">{JSON.parse(assertion.valueJson) as number} W</span>{' '}
      <ConfidenceBadge confidence={assertion.confidence} size="sm" />
    </p>
  )
}

export function TabCapacidades({ datos }: { datos: DatosPestana }): React.JSX.Element {
  if (datos.atributosLoading) return <p role="status">Cargando capacidades…</p>
  return (
    <div className="stack">
      <TablaAtributos atributos={datos.atributos} />
      <CapacidadThroughput assertionDe={datos.assertionDe} />
      <ConsumoEnergia assertionDe={datos.assertionDe} />
    </div>
  )
}

interface ArquitecturaInterna {
  cpu?: string
  ram?: string
  soc?: { family?: string; note?: string }
  contentProcessors?: readonly string[]
  networkProcessors?: readonly string[]
  storage?: { type?: string; capacityGB?: number }
  summary?: string
}

function TablaArquitectura({ v }: { v: ArquitecturaInterna }): React.JSX.Element {
  return (
    <table className="tabla-specs">
      <tbody>
        {v.cpu ? <tr><th scope="row">CPU</th><td className="mono">{v.cpu}</td></tr> : null}
        {v.ram ? <tr><th scope="row">Memoria</th><td className="mono">{v.ram}</td></tr> : null}
        {v.soc?.family ? <tr><th scope="row">SoC</th><td className="mono">{v.soc.family}{v.soc.note ? ` — ${v.soc.note}` : ''}</td></tr> : null}
        {v.contentProcessors && v.contentProcessors.length > 0 ? (
          <tr><th scope="row">Procesadores de contenido</th><td className="mono">{v.contentProcessors.join(' + ')}</td></tr>
        ) : null}
        {v.networkProcessors && v.networkProcessors.length > 0 ? (
          <tr><th scope="row">Procesadores de red</th><td className="mono">{v.networkProcessors.join(' + ')}</td></tr>
        ) : null}
        {v.storage?.capacityGB ? (
          <tr><th scope="row">Almacenamiento</th><td className="mono">{v.storage.type} {v.storage.capacityGB} GB</td></tr>
        ) : null}
      </tbody>
    </table>
  )
}

/** Fuente y confianza de la arquitectura curada. */
function FuenteArquitectura({ assertion }: { assertion: Assertion }): React.JSX.Element {
  return (
    <p className="guia-tecnica">
      Fuente:{' '}
      <a href={assertion.source?.url ?? undefined} target="_blank" rel="noreferrer">{assertion.source?.title}</a>{' '}
      <ConfidenceBadge confidence={assertion.confidence} size="sm" />
      {assertion.pendingReview ? <span className="guia-tecnica"> · pendiente revisión</span> : null}
    </p>
  )
}

export function TabArquitectura({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const arq = datos.assertionDe('internal-architecture')
  if (!arq) {
    // Para entidades sin electrónica interna (medios pasivos) el empty-state
    // es honesto: «no aplica» en vez de «pendiente de curación».
    const sinArquitectura = datos.device.categoryCode.startsWith('CAT-PAS')
    const mensaje = sinArquitectura
      ? 'Sin arquitectura interna aplicable (elemento pasivo/medio de transmisión).'
      : 'Arquitectura interna (ASIC, CPU, memoria) pendiente de curación (F2).'
    return <Empty message={mensaje} />
  }
  const v = JSON.parse(arq.valueJson) as ArquitecturaInterna
  return (
    <div className="stack">
      {v.summary ? <p>{v.summary}</p> : null}
      <TablaArquitectura v={v} />
      <FuenteArquitectura assertion={arq} />
      {arq.note ? <p className="guia-tecnica">{arq.note}</p> : null}
    </div>
  )
}
