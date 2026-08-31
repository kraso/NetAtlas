import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'

/**
 * Ficha de estándar (NET-HW-023) — bidireccional:
 * detalle del estándar + dispositivos que lo implementan (arista implements-standard).
 */
export function StandardSheet(): React.JSX.Element {
  const { org = '', identifier = '' } = useParams<{ org: string; identifier: string }>()
  const ref = `${org}/${identifier}`
  const [detalle, setDetalle] = React.useState<{ title: string } | undefined>()
  const [dispositivos, setDispositivos] = React.useState<readonly { slug: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      const { graph, devices, catalog } = useServices.getState().services
      const [estandares, edges] = await Promise.all([
        catalog.listStandards(),
        graph.edgesOf({ type: 'standard', slug: ref }),
      ])
      const std = estandares.find((s) => `${s.org}/${s.identifier}` === ref)
      setDetalle(std ? { title: std.title } : undefined)

      const queImplementan = edges.filter((e) => e.predicate === 'implements-standard' && e.object.slug === ref)
      const lista: { slug: string; name: string }[] = []
      for (const e of queImplementan) {
        const d = await devices.findBySlug(e.subject.slug)
        if (d) lista.push({ slug: d.slug.value, name: d.name })
      }
      setDispositivos(lista)
      setLoading(false)
    })()
  }, [ref])

  return (
    <section aria-labelledby="titulo-estandar">
      <h1 id="titulo-estandar" className="mono">{ref}</h1>
      {detalle ? <p className="guia-tecnica">{detalle.title}</p> : <p className="guia-tecnica">Estándar sin ficha de catálogo (§15 pendiente).</p>}

      <h2>Dispositivos que lo implementan ({dispositivos.length})</h2>
      {loading ? <p role="status">Cargando…</p> : null}
      {!loading && dispositivos.length === 0 ? (
        <div className="empty-state">Ningún dispositivo del dataset declara implements-standard para {ref}.</div>
      ) : (
        <ul>
          {dispositivos.map((d) => (
            <li key={d.slug}>
              <Link to={`/device/${d.slug}`}>{d.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}