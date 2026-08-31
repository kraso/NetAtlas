import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CategoryIcon } from '@netatlas/ui'
import { useCatalogStore, rootCategories } from '../viewmodels/catalog-store.js'
import { useSearchStore } from '../viewmodels/search-store.js'
import { useServices } from '../composition-root.js'

/**
 * Dashboard (§10.3): barra de búsqueda dominante + accesos por macrocategoría.
 * Panel de estadísticas del dataset (número de dispositivos y categorías).
 */
export function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const categories = useCatalogStore((s) => s.categories)
  const { query, setQuery, dslPreview } = useSearchStore()
  const [deviceCount, setDeviceCount] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      const count = await useServices.getState().services.devices.count()
      setDeviceCount(count)
    })()
  }, [])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const trimmed = query.trim()
    // El DSL y el texto libre van al mismo campo; la ficha se abre si hay hit exacto.
    if (trimmed.length === 0) return
    navigate(`/explore?q=${encodeURIComponent(trimmed)}`)
  }

  const raices = rootCategories(categories)

  return (
    <section aria-labelledby="titulo-dashboard">
      <h1 id="titulo-dashboard" className="sr-only">
        NetAtlas — Dashboard
      </h1>

      <form role="search" onSubmit={submit} aria-label="Buscar hardware de redes">
        <label htmlFor="busqueda" className="sr-only">
          Buscar dispositivos, protocolos o estándares
        </label>
        <input
          id="busqueda"
          className="search-input"
          type="search"
          placeholder="Ej. +protocolo:bgp +protocolo:ospf · switch 48 puertos · cat:sw"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="busqueda-dashboard"
        />
        <button type="submit" style={{ marginTop: 8 }}>
          Buscar
        </button>
        {dslPreview.length > 0 ? (
          <p className="mono guia-tecnica" role="status">
            Consulta detectada: {dslPreview.join(' ')}
          </p>
        ) : null}
      </form>

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