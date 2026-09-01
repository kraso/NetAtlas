import React from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { CategoryIcon } from '@netatlas/ui'
import { useCatalogStore, rootCategories, childrenOf } from '../viewmodels/catalog-store.js'
import { useSearchStore } from '../viewmodels/search-store.js'
import { useServices } from '../composition-root.js'
import type { Device } from '@netatlas/domain'
import type { UiFacetCount, UiAttributeDefinition } from '../composition-root.js'

/**
 * Explorador (§10.4): árbol jerárquico (izquierda) + resultados (tabla) +
 * facetas dinámicas por atributo (F3/NET-HW-029-EAV): se derivan de las
 * definiciones de categoría (EAV §9.4) y filtran los resultados al vuelo.
 */

interface FacetaUI {
  readonly key: string
  readonly labelEs: string
  readonly valueType: UiAttributeDefinition['valueType']
  readonly unit?: string
  readonly enumValues?: readonly string[]
  readonly conteos: readonly UiFacetCount[]
}

export function Explore(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const categories = useCatalogStore((s) => s.categories)
  const selectedCat = params.get('cat')
  const query = params.get('q') ?? ''
  const { devices } = useServices.getState().services
  const [resultados, setResultados] = React.useState<readonly Device[]>([])
  const [loading, setLoading] = React.useState(false)
  // F3 — facetas dinámicas EAV
  const [facetas, setFacetas] = React.useState<readonly FacetaUI[]>([])
  const [seleccion, setSeleccion] = React.useState<Record<string, readonly string[]>>({})
  // F5 — selección múltiple hacia el comparador (CU-02)
  const [marcados, setMarcados] = React.useState<ReadonlySet<string>>(new Set())

  const raices = rootCategories(categories)
  const facetasActivas = Object.keys(seleccion).filter((k) => (seleccion[k]?.length ?? 0) > 0).length

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

  // F3 — carga las facetas dinámicas de la categoría seleccionada
  React.useEffect(() => {
    setSeleccion({})
    if (!selectedCat) {
      setFacetas([])
      return
    }
    void (async () => {
      const { attributes } = useServices.getState().services
      const defs = await attributes.attributeDefinitionsByCategory(selectedCat)
      const facetables = defs.filter((d) => d.isFacet)
      const conConteos: FacetaUI[] = []
      for (const d of facetables) {
        const conteos = await attributes.facetCounts(selectedCat, d.key)
        if (conteos.length > 0) conConteos.push({ key: d.key, labelEs: d.labelEs, valueType: d.valueType, unit: d.unit, enumValues: d.enumValues, conteos })
      }
      setFacetas(conConteos)
    })()
  }, [selectedCat])

  // F3 — aplica el filtro de facetas sobre los resultados de la categoría
  const [slugsFiltrados, setSlugsFiltrados] = React.useState<ReadonlySet<string>>(new Set())
  React.useEffect(() => {
    if (!selectedCat || facetasActivas === 0) {
      setSlugsFiltrados(new Set())
      return
    }
    void (async () => {
      const { attributes } = useServices.getState().services
      const slugs = await attributes.filterByFacetValues(selectedCat, seleccion)
      setSlugsFiltrados(new Set(slugs))
    })()
  }, [selectedCat, seleccion, facetasActivas])

  const visibles = React.useMemo(() => {
    if (!selectedCat || facetasActivas === 0) return resultados
    return resultados.filter((d) => slugsFiltrados.has(d.slug.value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados, seleccion, selectedCat, facetasActivas, slugsFiltrados])

  const toggleValor = (key: string, valor: string): void => {
    setSeleccion((prev) => {
      const actual = prev[key] ?? []
      const next = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]
      return { ...prev, [key]: next }
    })
  }

  const limpiarFacetas = (): void => setSeleccion({})

  const toggleMarcar = (slug: string): void => {
    setMarcados((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const compararSeleccionados = (): void => {
    const ids = [...marcados]
    if (ids.length >= 2) navegar(`/comparar?ids=${ids.join(',')}`)
  }

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

          {selectedCat ? <FacetasPanel facetas={facetas} seleccion={seleccion} onToggle={toggleValor} onLimpiar={limpiarFacetas} activas={facetasActivas} /> : null}

          <section aria-label="Resultados" style={{ marginTop: 16 }}>
            {marcados.size >= 2 ? (
              <button type="button" onClick={compararSeleccionados} style={{ marginBottom: 8 }} data-testid="comparar-seleccionados">
                Comparar seleccionados ({marcados.size}) →
              </button>
            ) : (
              <p className="guia-tecnica" style={{ margin: '4px 0 8px' }}>
                Marca al menos dos dispositivos para compararlos (CU-02 / F5).
              </p>
            )}
            {loading ? <p role="status">Cargando…</p> : null}
            {visibles.length === 0 && !loading ? (
              <div className="empty-state">Sin resultados. Elige una categoría o escribe una consulta (desde el ciclo 28.1.6#1, el DSL resuelve las 7 canónicas).</div>
            ) : (
              <table className="tabla-specs">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Comparar</span>
                    </th>
                    <th scope="col">Dispositivo</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Fabricante</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((d) => (
                    <tr key={d.slug.value}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Comparar ${d.name}`}
                          checked={marcados.has(d.slug.value)}
                          onChange={() => toggleMarcar(d.slug.value)}
                        />
                      </td>
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

/** Panel de facetas dinámicas por atributo (F3): un grupo por atributo facetado. */
function FacetasPanel({
  facetas,
  seleccion,
  onToggle,
  onLimpiar,
  activas,
}: {
  facetas: readonly FacetaUI[]
  seleccion: Readonly<Record<string, readonly string[]>>
  onToggle: (key: string, valor: string) => void
  onLimpiar: () => void
  activas: number
}): React.JSX.Element {
  if (facetas.length === 0) {
    return (
      <p className="guia-tecnica" style={{ marginTop: 12 }}>
        Esta categoría no tiene atributos facetados curados (EAV §9.4).
      </p>
    )
  }
  return (
    <aside aria-label="Filtros dinámicos por atributo" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>Filtros dinámicos</h2>
        {activas > 0 ? (
          <button type="button" onClick={onLimpiar} className="guia-tecnica" style={{ fontSize: 'var(--font-size-xs)' }}>
            Limpiar ({activas})
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {facetas.map((f) => (
          <fieldset key={f.key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', margin: 0, minWidth: 170 }}>
            <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>
              {f.labelEs}
              {f.unit ? <span className="mono"> ({f.unit})</span> : null}
            </legend>
            <div className="row" role="group" aria-label={f.labelEs} style={{ flexWrap: 'wrap' }}>
              {f.conteos.map((c) => {
                const activo = (seleccion[f.key] ?? []).includes(c.value)
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => onToggle(f.key, c.value)}
                    className="mono"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px' }}
                  >
                    {c.value} <span aria-hidden="true">·{c.count}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </aside>
  )
}