import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'
import { calculeEnlaceOptico, FIBRAS, TRANSCEIVERS_CANONICOS } from '@netatlas/domain'

/**
 * Ficha de medio de transmisión (NET-HW-023, §16) — bidireccional + calculadora
 * de enlace anclada: dispositivos que lo terminan y enlace de ejemplo (CU-14).
 */
export function MediumSheet(): React.JSX.Element {
  const { code = '' } = useParams<{ code: string }>()
  const [detalle, setDetalle] = React.useState<{ kind: string; name: string; maxSpeedMbps?: number } | undefined>()
  const [dispositivos, setDispositivos] = React.useState<readonly { slug: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      const { graph, devices, catalog } = useServices.getState().services
      const [medios, edges] = await Promise.all([
        catalog.listMedia(),
        graph.edgesOf({ type: 'medium', slug: code }),
      ])
      const med = medios.find((m) => m.code === code)
      setDetalle(med ? { kind: med.kind, name: med.name, maxSpeedMbps: med.maxSpeedMbps } : undefined)

      const queTerminan = edges.filter((e) => e.predicate === 'terminates-medium' && e.object.slug === code)
      const lista: { slug: string; name: string }[] = []
      for (const e of queTerminan) {
        const d = await devices.findBySlug(e.subject.slug)
        if (d) lista.push({ slug: d.slug.value, name: d.name })
      }
      setDispositivos(lista)
      setLoading(false)
    })()
  }, [code])

  return (
    <section aria-labelledby="titulo-medio">
      <h1 id="titulo-medio" className="mono">{code}</h1>
      {detalle ? (
        <p className="guia-tecnica">
          {detalle.name} · {detalle.kind}
          {detalle.maxSpeedMbps ? ` · máx ${detalle.maxSpeedMbps >= 1000 ? `${detalle.maxSpeedMbps / 1000}G` : `${detalle.maxSpeedMbps}M`}bps` : ''}
        </p>
      ) : (
        <p className="guia-tecnica">Medio sin ficha de catálogo (§16 pendiente).</p>
      )}

      <h2>Dispositivos que lo terminan ({dispositivos.length})</h2>
      {loading ? <p role="status">Cargando…</p> : null}
      {!loading && dispositivos.length === 0 ? (
        <div className="empty-state">Ningún dispositivo del dataset termina este medio.</div>
      ) : (
        <ul>
          {dispositivos.map((d) => (
            <li key={d.slug}>
              <Link to={`/device/${d.slug}`}>{d.name}</Link>
            </li>
          ))}
        </ul>
      )}

      {code === 'smf-os2' ? <EnlaceEjemplo /> : null}
    </section>
  )
}

/** Ejemplo de la calculadora de enlace anclado al medio (CU-14: 10 km SMF, 1310 nm). */
function EnlaceEjemplo(): React.JSX.Element {
  const smf = FIBRAS.find((f) => f.code === 'smf-os2')!
  const lr = TRANSCEIVERS_CANONICOS.find((t) => t.code === 'sfp-10g-lr')!
  const r = calculeEnlaceOptico({ distanciaKm: 10, fibra: smf, transceiver: lr, conectores: 2 })
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 'var(--font-size-md)' }}>Calculadora de enlace (CU-14)</h3>
      <p className="guia-tecnica">10 km · SMF OS2 · transceptor LR 1310 nm · 2 conectores</p>
      <table className="tabla-specs">
        <tbody>
          <tr><th scope="row">Presupuesto óptico</th><td className="mono">{r.presupuestoTotalDb} dB</td></tr>
          <tr><th scope="row">Pérdida del enlace</th><td className="mono">{r.perdidaEnlaceDb} dB</td></tr>
          <tr><th scope="row">Margen</th><td className="mono">{r.margenDb} dB</td></tr>
          <tr><th scope="row">Viable</th><td className="mono">{r.viable ? '✅' : '❌'}</td></tr>
        </tbody>
      </table>
      <p className="guia-tecnica">{r.note}</p>
    </div>
  )
}