import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'
import type { Device } from '@netatlas/domain'

/**
 * Página de fabricante (NET-HW-027): fabricante → familias → modelos.
 * Resuelve el fabricante por slug y agrupa sus dispositivos por familia.
 */
export function ManufacturerSheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const [nombre, setNombre] = React.useState<string | undefined>()
  const [dispositivos, setDispositivos] = React.useState<readonly Device[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      const { catalog, devices } = useServices.getState().services
      const mfr = await catalog.manufacturerBySlug(slug)
      setNombre(mfr?.name)
      const page = await devices.findByManufacturer(slug, { limit: 500 })
      setDispositivos(page.items)
      setLoading(false)
    })()
  }, [slug])

  // Agrupa por familia (familySlug) preservando orden
  const porFamilia = React.useMemo(() => {
    const map = new Map<string, Device[]>()
    for (const d of dispositivos) {
      const fam = d.familySlug ?? '(sin familia)'
      const lista = map.get(fam) ?? []
      lista.push(d)
      map.set(fam, lista)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [dispositivos])

  return (
    <section aria-labelledby="titulo-fabricante">
      <h1 id="titulo-fabricante">{nombre ?? slug}</h1>
      <p className="guia-tecnica">Dispositivos: {dispositivos.length}</p>

      {loading ? <p role="status">Cargando…</p> : null}
      {!loading && dispositivos.length === 0 ? (
        <div className="empty-state">Sin dispositivos curados para este fabricante.</div>
      ) : (
        porFamilia.map(([familia, items]) => (
          <section key={familia} aria-label={`Familia ${familia}`} style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 'var(--font-size-md)' }}>{familia}</h2>
            <ul>
              {items.map((d) => (
                <li key={d.slug.value}>
                  <Link to={`/device/${d.slug.value}`}>{d.name}</Link>
                  <span className="guia-tecnica" style={{ marginLeft: 8 }}>
                    {d.categoryCode}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}