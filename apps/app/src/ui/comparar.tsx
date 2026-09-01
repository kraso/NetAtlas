import React from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'
import { Breadcrumbs } from './breadcrumbs.js'
import type { Device } from '@netatlas/domain'

/**
 * Comparador — puente F3→F5 (NET-HW-032): "Comparar desde aquí" aterriza en
 * esta ruta con los slugs a/b. La comparativa completa (tabla lado a lado con
 * reglas compareRule del EAV) se implementa en F5; aquí se fijan los dos
 * contendientes y se muestra su contexto básico.
 */
export function Comparar(): React.JSX.Element {
  const [params] = useSearchParams()
  const a = params.get('a')
  const b = params.get('b')
  const { devices } = useServices.getState().services
  const [da, setDa] = React.useState<Device | undefined>()
  const [db, setDb] = React.useState<Device | undefined>()

  React.useEffect(() => {
    void (async () => {
      const [x, y] = await Promise.all([
        a ? devices.findBySlug(a) : Promise.resolve(undefined),
        b ? devices.findBySlug(b) : Promise.resolve(undefined),
      ])
      setDa(x)
      setDb(y)
    })()
  }, [a, b, devices])

  return (
    <section aria-labelledby="titulo-comparar">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Explorar', to: '/explore' },
          { label: 'Comparación' },
        ]}
      />
      <h1 id="titulo-comparar">Comparación de dispositivos</h1>

      {!a || !b ? (
        <p className="empty-state">
          El comparador necesita dos dispositivos. Elige uno desde la ficha («Comparar desde aquí») o desde el{' '}
          <Link to="/explore">explorador</Link>. La comparativa lado a lado completa (reglas compareRule del EAV)
          se entrega en F5; esta pantalla fija el punto de partida.
        </p>
      ) : da === undefined || db === undefined ? (
        <p role="status">Cargando contendientes…</p>
      ) : (
        <div className="stack">
          <p className="guia-tecnica">
            Comparando <span className="mono">{da.slug.value}</span> con <span className="mono">{db.slug.value}</span>.
          </p>
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col">
                  <Link to={`/device/${da.slug.value}`}>{da.name}</Link>
                </th>
                <th scope="col">
                  <Link to={`/device/${db.slug.value}`}>{db.name}</Link>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Slug</th>
                <td className="mono">{da.slug.value}</td>
                <td className="mono">{db.slug.value}</td>
              </tr>
              <tr>
                <th scope="row">Categoría</th>
                <td className="mono">{da.categoryCode}</td>
                <td className="mono">{db.categoryCode}</td>
              </tr>
              <tr>
                <th scope="row">Fabricante</th>
                <td className="mono">{da.manufacturerSlug}</td>
                <td className="mono">{db.manufacturerSlug}</td>
              </tr>
              <tr>
                <th scope="row">Ciclo de vida</th>
                <td className="mono">{da.lifecycleStatus}</td>
                <td className="mono">{db.lifecycleStatus}</td>
              </tr>
            </tbody>
          </table>
          <p className="guia-tecnica" role="note">
            La tabla comparativa completa de especificaciones y capacidades (EAV §9.4,
            reglas higher-better / lower-better / set-compare) se entrega en F5.
          </p>
        </div>
      )}
    </section>
  )
}