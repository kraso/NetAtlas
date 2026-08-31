import React from 'react'
import { Link } from 'react-router-dom'
import { CategoryIcon } from '@netatlas/ui'
import { useCatalogStore, rootCategories } from '../viewmodels/catalog-store.js'
import { useSearchStore } from '../viewmodels/search-store.js'
import { useServices } from '../composition-root.js'
import { SearchBox } from './search-box.js'

/**
 * Dashboard (§10.3): caja de búsqueda dominante con autocompletado
 * agrupado (NET-HW-014) + accesos por macrocategoría + estadísticas.
 */
export function Dashboard(): React.JSX.Element {
  const categories = useCatalogStore((s) => s.categories)
  const { dslPreview } = useSearchStore()
  const [deviceCount, setDeviceCount] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      const count = await useServices.getState().services.devices.count()
      setDeviceCount(count)
    })()
  }, [])

  const raices = rootCategories(categories)

  return (
    <section aria-labelledby="titulo-dashboard">
      <h1 id="titulo-dashboard" className="sr-only">
        NetAtlas — Dashboard
      </h1>

      <SearchBox />
      {dslPreview.length > 0 ? (
        <p className="mono guia-tecnica" role="status">
          Consulta detectada: {dslPreview.join(' ')}
        </p>
      ) : null}

      <h2>Explorar por categoría</h2>
      <div className="grid-categorias">
        {raices.map((cat) => (
          <Link key={cat.code} className="card-categoria" to={`/explore?cat=${cat.code}`}>
            <CategoryIcon category={cat.code} size={28} />
            <strong>{cat.nameEs}</strong>
            <span className="mono guia-tecnica">{cat.code}</span>
          </Link>
        ))}
      </div>

      <p className="guia-tecnica" style={{ marginTop: 24 }}>
        Dataset de demostración: <span className="mono">{deviceCount}</span> dispositivos ·{' '}
        <span className="mono">{categories.length}</span> categorías.
      </p>
    </section>
  )
}