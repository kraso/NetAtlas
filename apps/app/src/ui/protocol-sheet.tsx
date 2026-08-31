import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { confidenceLabel } from '@netatlas/ui'
import { useServices } from '../composition-root.js'

/**
 * Ficha de protocolo (§10.7) — bidireccionalidad:
 * la pestaña Protocolos de un dispositivo enlaza aquí, y la ficha del
 * protocolo devuelve la lista de dispositivos que lo soportan
 * (arista supports-protocol invertida).
 */
export function ProtocolSheet(): React.JSX.Element {
  const { code = '' } = useParams<{ code: string }>()
  const [dispositivos, setDispositivos] = React.useState<readonly { slug: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      const { graph, devices } = useServices.getState().services
      const edges = await graph.edgesOf({ type: 'protocol', slug: code })
      const soportados = edges.filter((e) => e.predicate === 'supports-protocol')
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
      <p className="guia-tecnica">Protocolo · familia y detalle se curan en F2 (catálogo de protocolos §14).</p>

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
        Insignia de confianza de cada soporte: <span className="mono">{confidenceLabel('third-party')}</span> en el dataset de demostración; con
        assertions reales en el SQLite (Fase C).
      </p>
    </section>
  )
}