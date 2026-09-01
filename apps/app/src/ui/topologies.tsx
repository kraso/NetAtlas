import React from 'react'
import { Link } from 'react-router-dom'
import { useTopologiesStore } from '../viewmodels/topologies-store.js'
import { Breadcrumbs } from './breadcrumbs.js'

/**
 * Visor de topologías (NET-HW-033): listado de topologías de referencia y de
 * usuario, entrada al laboratorio (NET-HW-034) y al mapa global (NET-HW-036).
 */
export function Topologias(): React.JSX.Element {
  const { topologies, loading, load } = useTopologiesStore()

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <section aria-labelledby="titulo-topologias">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Topologías' },
        ]}
      />
      <h1 id="titulo-topologias">Topologías</h1>
      <p className="guia-tecnica">
        Diagramas de red interactivos (sección 13 del plan): mueve los nodos y el layout se persiste;
        cada nodo enlaza a su ficha. El laboratorio permite crear topologías propias con validación de compatibilidad.
      </p>

      <div className="row" style={{ gap: 10, marginTop: 4 }}>
        <Link to="/topology/nueva" className="boton" role="button">
          + Nueva topología (laboratorio)
        </Link>
        <Link to="/mapa-global" className="boton" role="button">
          Mapa global del conocimiento
        </Link>
      </div>

      {loading ? (
        <p role="status">Cargando topologías…</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {topologies.map((t) => (
            <li key={t.slug.value} className="card">
              <Link to={`/topology/${t.slug.value}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2 style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>{t.name}</h2>
              </Link>
              <p className="mono guia-tecnica" style={{ margin: '4px 0' }}>
                {t.slug.value} · {t.kind === 'reference' ? 'referencia' : 'usuario'}
              </p>
              <p className="guia-tecnica" style={{ margin: 0 }}>
                {t.nodes.length} nodos · {t.edges.length} enlaces
              </p>
              <p className="guia-tecnica">
                <Link to={`/topology/${t.slug.value}`}>Abrir visor →</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}