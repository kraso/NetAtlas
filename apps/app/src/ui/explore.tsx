import React from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CategoryIcon } from '@netatlas/ui'
import { useCatalogStore, rootCategories, childrenOf } from '../viewmodels/catalog-store.js'
import { useSearchStore } from '../viewmodels/search-store.js'
import { useServices } from '../composition-root.js'
import type { Device } from '@netatlas/domain'

/**
 * Explorador (§10.4): árbol jerárquico (izquierda) + faceta de categoría
 * (centro-izq) + resultados (tabla accesible). En F2 las facetas dinámicas
 * por atributo sustituyen a la faceta básica de categoría.
 */
export function Explore(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const categories = useCatalogStore((s) => s.categories)
  const selectedCat = params.get('cat')
  const query = params.get('q') ?? ''
  const { devices } = useServices.getState().services
  const [resultados, setResultados] = React.useState<readonly Device[]>([])
  const [loading, setLoading] = React.useState(false)

  const raices = rootCategories(categories)

  React.useEffect(() => {
    void (async () => {
      setLoading(true)
      if (selectedCat) {
        const page = await devices.listByCategory(selectedCat, { limit: 200 })
        setResultados(page.items)
      } else if (query) {
        const res = await useServices.getState().services.search.query({ rawQuery: query, limit: 50 })
        const slugs = res.hits.map((h: { slug: string }) => h.slug)
        const found: Device[] = []
        for (const s of slugs) {
          const d = await devices.findBySlug(s)
          if (d) found.push(d)
        }
        setResultados(found)
      } else {
        setResultados([])
      }
      setLoading(false)
    })()
  }, [selectedCat, query, devices])

  const selectCat = (code: string): void => {
    const next = new URLSearchParams(params)
    next.set('cat', code)
    next.delete('q')
    setParams(next)
  }

  const tree = (parent?: string): React.JSX.Element[] => {
    const items = parent === undefined ? raices : childrenOf(categories, parent)
    return items.map((cat) => (
      <li key={cat.code}>
        <button
          type="button"
          onClick={() => selectCat(cat.code)}
          aria-pressed={selectedCat === cat.code}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 0' }}
        >
          <CategoryIcon category={cat.code} size={16} />
          <span>{cat.nameEs}</span>
        </button>
        {childrenOf(categories, cat.code).length > 0 ? <ul style={{ paddingLeft: 18 }}>{tree(cat.code)}</ul> : null}
      </li>
    ))
  }

  const { setQuery } = useSearchStore()

  return (
    <section aria-labelledby="titulo-explorador">
      <h1 id="titulo-explorador" className="sr-only">
        Explorador de hardware
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        <nav aria-label="Árbol de categorías">
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Categorías</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{tree()}</ul>
        </nav>

        <div>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              const v = new FormData(e.currentTarget).get('q') as string
              const next = new URLSearchParams(params)
              if (v.trim()) {
                next.set('q', v.trim())
                next.delete('cat')
              } else {
                next.delete('q')
              }
              setParams(next)
              setQuery(v)
            }}
          >
            <label htmlFor="q-explorador" className="sr-only">
              Consulta
            </label>
            <input id="q-explorador" name="q" className="search-input" placeholder="cat:sw puertos:48 poe:*" defaultValue={query} data-testid="q-explorador" />
            <button type="submit">Filtrar</button>
          </form>

          <section aria-label="Resultados" style={{ marginTop: 16 }}>
            {loading ? <p role="status">Cargando…</p> : null}
            {resultados.length === 0 && !loading ? (
              <div className="empty-state">Sin resultados. Elige una categoría o escribe una consulta (desde el ciclo 28.1.6#1, el DSL resuelve las 7 canónicas).</div>
            ) : (
              <table className="tabla-specs">
                <thead>
                  <tr>
                    <th scope="col">Dispositivo</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Fabricante</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((d) => (
                    <tr key={d.slug.value}>
                      <td>
                        <Link to={`/device/${d.slug.value}`}>{d.name}</Link>
                      </td>
                      <td className="mono">{d.categoryCode}</td>
                      <td className="mono">{d.manufacturerSlug}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}