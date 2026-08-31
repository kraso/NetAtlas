import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { confidenceLabel } from '@netatlas/ui'
import { useServices } from '../composition-root.js'

/**
 * Ficha de protocolo (§10.7, NET-HW-023) — bidireccional:
 * detalle del protocolo (del catálogo cerrado) + dispositivos que lo soportan
 * (arista supports-protocol invertida).
 */
export function ProtocolSheet(): React.JSX.Element {
  const { code = '' } = useParams<{ code: string }>()
  const [detalle, setDetalle] = React.useState<{ name: string; family: string; osiLayer: number } | undefined>()
  const [dispositivos, setDispositivos] = React.useState<readonly { slug: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      const { graph, devices, catalog } = useServices.getState().services
      const [protocolos, edges] = await Promise.all([
        catalog.listProtocols(),
        graph.edgesOf({ type: 'protocol', slug: code }),
      ])
      const detalle = protocolos.find((p) => p.code === code)
      setDetalle(detalle ? { name: detalle.name, family: detalle.family, osiLayer: detalle.osiLayer } : undefined)

      const soportados = edges.filter((e) => e.predicate === 'supports-protocol' && e.object.slug === code)
      const lista: { slug: string; name: string }[] = []
      for (const e of soportados) {
        const d = await devices.findBySlug(e.subject.slug)
        if (d) lista.push({ slug: d.slug.value, name: d.name })
      }
      setDispositivos(lista)
      setLoading(false)
    })()
  }, [code])

  return (
    <section aria-labelledby="titulo-protocolo">
      <h1 id="titulo-protocolo" className="mono">{code.replace(/-/g, ' ')}</h1>
      {detalle ? (
        <p className="guia-tecnica">
          {detalle.name} · familia {detalle.family} · capa OSI {detalle.osiLayer}
        </p>
      ) : (
        <p className="guia-tecnica">Protocolo sin ficha de catálogo (§14 pendiente de curación).</p>
      )}

      <h2>Dispositivos que lo soportan ({dispositivos.length})</h2>
      {loading ? <p role="status">Cargando…</p> : null}
      {!loading && dispositivos.length === 0 ? (
        <div className="empty-state">
          Ningún dispositivo del dataset declara <span className="mono">{code}</span>.
        </div>
      ) : (
        <ul>
          {dispositivos.map((d) => (
            <li key={d.slug}>
              <Link to={`/device/${d.slug}`}>{d.name}</Link>
            </li>
          ))}
        </ul>
      )}

      <p className="guia-tecnica" style={{ marginTop: 16 }}>
        Soporte con insignia de confianza de cada relación (en el SQLite real: assertions {confidenceLabel('third-party')} asistidas).
      </p>
    </section>
  )
}