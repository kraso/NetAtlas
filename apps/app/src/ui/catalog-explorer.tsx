import React from 'react'
import { Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'

/**
 * Exploradores de catálogos (NET-HW-023): protocolos, estándares y medios —
 * listados bidireccionales que enlazan a la ficha de cada entidad.
 */

type TipoCatalogo = 'protocolos' | 'estandares' | 'medios'

const TIPOS: readonly { id: TipoCatalogo; label: string }[] = [
  { id: 'protocolos', label: 'Protocolos' },
  { id: 'estandares', label: 'Estándares' },
  { id: 'medios', label: 'Medios' },
]

export function CatalogExplorer(): React.JSX.Element {
  const [tipo, setTipo] = React.useState<TipoCatalogo>('protocolos')

  return (
    <section aria-labelledby="titulo-catalogos">
      <h1 id="titulo-catalogos" className="sr-only">Explorar catálogos técnicos</h1>
      <div role="tablist" aria-label="Tipo de catálogo" className="ficha-tabs">
        {TIPOS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tipo === t.id} onClick={() => setTipo(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tipo === 'protocolos' ? <ProtocolosGrid /> : null}
      {tipo === 'estandares' ? <EstandaresGrid /> : null}
      {tipo === 'medios' ? <MediosGrid /> : null}
    </section>
  )
}

function ProtocolosGrid(): React.JSX.Element {
  const [rows, setRows] = React.useState<readonly { code: string; name: string; family: string; osiLayer: number }[]>([])
  const revision = useServices((s) => s.revision)
  React.useEffect(() => {
    void (async () => {
      setRows(await useServices.getState().services.catalog.listProtocols())
    })()
  }, [revision])
  return (
    <div className="stack">
      <p className="guia-tecnica">{rows.length} protocolos del catálogo cerrado (§14).</p>
      <ul role="list" style={{ paddingLeft: 20 }}>
        {rows.map((p) => (
          <li key={p.code}>
            <Link to={`/protocolo/${p.code}`} className="mono">{p.code}</Link>
            <span style={{ marginLeft: 8 }}>{p.name}</span>
            <span className="guia-tecnica" style={{ marginLeft: 8 }}>
              {p.family} · capa {p.osiLayer}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EstandaresGrid(): React.JSX.Element {
  const [rows, setRows] = React.useState<readonly { org: string; identifier: string; title: string }[]>([])
  const revision = useServices((s) => s.revision)
  React.useEffect(() => {
    void (async () => {
      setRows(await useServices.getState().services.catalog.listStandards())
    })()
  }, [revision])
  return (
    <div className="stack">
      <p className="guia-tecnica">{rows.length} estándares del catálogo cerrado (§15).</p>
      <ul role="list" style={{ paddingLeft: 20 }}>
        {rows.map((s) => (
          <li key={`${s.org}/${s.identifier}`}>
            <Link to={`/estandar/${s.org}/${s.identifier}`} className="mono">{s.org}/{s.identifier}</Link>
            <span style={{ marginLeft: 8 }}>{s.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MediosGrid(): React.JSX.Element {
  const [rows, setRows] = React.useState<readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[]>([])
  const revision = useServices((s) => s.revision)
  React.useEffect(() => {
    void (async () => {
      setRows(await useServices.getState().services.catalog.listMedia())
    })()
  }, [revision])
  return (
    <div className="stack">
      <p className="guia-tecnica">{rows.length} medios de transmisión del catálogo (§16).</p>
      <ul role="list" style={{ paddingLeft: 20 }}>
        {rows.map((m) => (
          <li key={m.code}>
            <Link to={`/medio/${m.code}`} className="mono">{m.code}</Link>
            <span style={{ marginLeft: 8 }}>{m.name}</span>
            <span className="guia-tecnica" style={{ marginLeft: 8 }}>
              {m.kind}{m.maxSpeedMbps ? ` · máx ${m.maxSpeedMbps >= 1000 ? `${m.maxSpeedMbps / 1000}G` : `${m.maxSpeedMbps}M`}bps` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}