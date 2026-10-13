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
  const errorCatalogo = useCatalogStore((s) => s.error)
  const { dslPreview } = useSearchStore()
  const revision = useServices((s) => s.revision)
  const [deviceCount, setDeviceCount] = React.useState(0)
  const [errorConteo, setErrorConteo] = React.useState<string | undefined>()

  React.useEffect(() => {
    void (async () => {
      try {
        const count = await useServices.getState().services.devices.count()
        setDeviceCount(count)
        setErrorConteo(undefined)
      } catch (error) {
        // El pie tampoco puede quedarse en «0 dispositivos» como si el dataset
        // estuviera vacío: se registra con contexto y se avisa en la página.
        console.error('[ERROR] no se pudo contar los dispositivos del dataset', { error })
        setErrorConteo('No se pudo contar los dispositivos del dataset.')
      }
    })()
  }, [revision])

  const raices = rootCategories(categories)

  return (
    <section aria-labelledby="titulo-dashboard">
      <h1 id="titulo-dashboard" className="sr-only">
        NetAtlas — Dashboard
      </h1>

      <SearchBox />
      {errorCatalogo ? (
        <p className="empty-state" role="alert" data-testid="error-catalogo">
          {errorCatalogo}
        </p>
      ) : null}
      {errorConteo ? (
        <p className="empty-state" role="alert" data-testid="error-conteo">
          {errorConteo}
        </p>
      ) : null}
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