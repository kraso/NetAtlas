import React from 'react'
import { Link } from 'react-router-dom'
import { ArbolCategorias, FacetasPanel } from './explore-piezas.js'
import { useExplorador } from './explore-hooks.js'

/**
 * Explorador (§10.4): árbol jerárquico (izquierda) + resultados (tabla) +
 * facetas dinámicas por atributo (F3/NET-HW-029-EAV): se derivan de las
 * definiciones de categoría (EAV §9.4) y filtran los resultados al vuelo.
 *
 * El estado y los manejadores viven en `useExplorador`; la carga en
 * `explore-carga.ts` y las vistas de apoyo en sus módulos.
 */

export function Explore(): React.JSX.Element {
  const e = useExplorador()

  return (
    <section aria-labelledby="titulo-explorador">
      <h1 id="titulo-explorador" className="sr-only">
        Explorador de hardware
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        <ArbolCategorias categories={e.categories} seleccionada={e.selectedCat} onSelect={e.onSelectCat} />
        <div>
          <FormularioBusqueda query={e.query} onBuscar={e.onBuscar} />

          {e.selectedCat ? (
            <FacetasPanel facetas={e.facetas} seleccion={e.seleccion} onToggle={e.onToggleValor} onLimpiar={e.onLimpiarFacetas} activas={e.facetasActivas} />
          ) : null}

          <section aria-label="Resultados" style={{ marginTop: 16 }}>
            {e.marcados.size >= 2 ? (
              <button type="button" onClick={e.onCompararSeleccionados} style={{ marginBottom: 8 }} data-testid="comparar-seleccionados">
                Comparar seleccionados ({e.marcados.size}) →
              </button>
            ) : (
              <p className="guia-tecnica" style={{ margin: '4px 0 8px' }}>
                Marca al menos dos dispositivos para compararlos (CU-02 / F5).
              </p>
            )}
            {e.loading ? <p role="status">Cargando…</p> : null}
            {e.error ? (
              <p className="empty-state" role="alert" data-testid="error-explorador">
                {e.error}
              </p>
            ) : null}
            {e.visibles.length === 0 && !e.loading && !e.error ? (
              <div className="empty-state">Sin resultados. Elige una categoría o escribe una consulta (desde el ciclo 28.1.6#1, el DSL resuelve las 7 canónicas).</div>
            ) : (
              <TablaResultados visibles={e.visibles} marcados={e.marcados} onToggleMarcar={e.onToggleMarcar} />
            )}
          </section>
        </div>
      </div>
    </section>
  )
}

/** Formulario de consulta DSL del explorador. */
function FormularioBusqueda({ query, onBuscar }: { query: string; onBuscar: (q: string) => void }): React.JSX.Element {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onBuscar((new FormData(e.currentTarget).get('q') as string) ?? '')
      }}
    >
      <label htmlFor="q-explorador" className="sr-only">
        Consulta
      </label>
      <input id="q-explorador" name="q" className="search-input" placeholder="cat:sw puertos:48 poe:*" defaultValue={query} data-testid="q-explorador" />
      <button type="submit">Filtrar</button>
    </form>
  )
}

/** Tabla de resultados con la casilla de comparación por dispositivo. */
function TablaResultados({
  visibles,
  marcados,
  onToggleMarcar,
}: {
  visibles: readonly { slug: { value: string }; name: string; categoryCode: string; manufacturerSlug: string }[]
  marcados: ReadonlySet<string>
  onToggleMarcar: (slug: string) => void
}): React.JSX.Element {
  return (
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
                onChange={() => onToggleMarcar(d.slug.value)}
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
  )
}