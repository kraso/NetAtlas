import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { OsiPanel, ConfidenceBadge } from '@netatlas/ui'
import { useCatalogStore } from '../viewmodels/catalog-store.js'
import { useServices } from '../composition-root.js'
import type { Device } from '@netatlas/domain'

/**
 * Ficha de dispositivo (§10.5) — pestañas. En F1 UI se implementan las 4
 * pestañas núcleo: Resumen, Especificaciones, Interfaces y Capas OSI.
 * Las 13 pestañas completas del plan llegan en el refinamiento F1 (Documentación,
 * Protocolos con insignia de fuente, Estándares, Compatibilidad, Historia…).
 */

type Pestaña = 'resumen' | 'especificaciones' | 'interfaces' | 'capas'

const PESTAÑAS: readonly { id: Pestaña; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'especificaciones', label: 'Especificaciones' },
  { id: 'interfaces', label: 'Interfaces' },
  { id: 'capas', label: 'Capas OSI' },
]

export function DeviceSheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const categories = useCatalogStore((s) => s.categories)
  const [device, setDevice] = React.useState<Device | undefined>()
  const [pestaña, setPestaña] = React.useState<Pestaña>('resumen')
  const [notFound, setNotFound] = React.useState(false)

  React.useEffect(() => {
    void (async () => {
      const d = await useServices.getState().services.devices.findBySlug(slug)
      setDevice(d)
      setNotFound(d === undefined)
    })()
  }, [slug])

  if (notFound) {
    return (
      <section aria-labelledby="no-encontrado">
        <h1 id="no-encontrado">Dispositivo no encontrado</h1>
        <p>
          «<span className="mono">{slug}</span>» no existe en el dataset. <Link to="/explore">Volver al explorador</Link>.
        </p>
      </section>
    )
  }
  if (!device) {
    return <p role="status">Cargando ficha…</p>
  }

  const cat = categories.find((c) => c.code === device.categoryCode)

  return (
    <section aria-labelledby={`ficha-${device.slug.value}`}>
      <h1 id={`ficha-${device.slug.value}`}>{device.name}</h1>
      <p className="mono guia-tecnica">
        {device.slug.value} · {cat?.nameEs ?? device.categoryCode} · {device.manufacturerSlug}
      </p>

      <div role="tablist" aria-label="Pestañas de la ficha" className="ficha-tabs">
        {PESTAÑAS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={pestaña === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setPestaña(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={`panel-${pestaña}`} role="tabpanel" aria-labelledby={`tab-${pestaña}`}>
        {pestaña === 'resumen' ? (
          <div className="stack">
            <p>{device.summary ?? 'Sin resumen curado.'}</p>
            <p>
              Ciclo de vida: <span className="mono">{device.lifecycleStatus}</span>{' '}
              <ConfidenceBadge confidence="official" size="sm" />
            </p>
          </div>
        ) : null}

        {pestaña === 'especificaciones' ? (
          <table className="tabla-specs">
            <tbody>
              <tr>
                <th scope="row">Modelo / SKU</th>
                <td className="mono">{device.model ?? '—'} {device.sku ? `(${device.sku})` : ''}</td>
              </tr>
              <tr>
                <th scope="row">Fabricante</th>
                <td>{device.manufacturerSlug}</td>
              </tr>
              <tr>
                <th scope="row">Capa principal</th>
                <td className="mono">{device.osiProfile?.profile.primary ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">Puertos totales</th>
                <td className="mono">{device.portCount()}</td>
              </tr>
              <tr>
                <th scope="row">Presentación</th>
                <td className="mono">{device.releasedOn ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        ) : null}

        {pestaña === 'interfaces' ? (
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Etiqueta</th>
                <th scope="col">Interfaz</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Velocidades</th>
                <th scope="col">PoE</th>
              </tr>
            </thead>
            <tbody>
              {device.ports.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="mono">{p.interfaceCode}</td>
                  <td className="mono">{p.quantity}</td>
                  <td className="mono">{p.speedsMbps.map((s) => (s >= 1000 ? `${s / 1000}G` : `${s}M`)).join(' / ')}</td>
                  <td className="mono">{p.poeStandard ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {pestaña === 'capas' ? <OsiTab device={device} /> : null}
      </div>
    </section>
  )
}

/**
 * Pestaña Capas OSI (NET-HW-021 §8.4.2):
 * panel vertical + panel TCP/IP derivado + consulta inversa "qué dispositivos
 * operan en estas capas" (lista de la misma categoría que termina la selección).
 */
function OsiTab({ device }: { device: Device }): React.JSX.Element {
  const categories = useCatalogStore((s) => s.categories)
  const { devices } = useServices.getState().services
  const [seleccion, setSeleccion] = React.useState<readonly number[]>([device.osiProfile?.profile.primary ?? 3])
  const [similares, setSimilares] = React.useState<readonly Device[]>([])

  const perfil = device.osiProfile
  if (!perfil) {
    return <p className="empty-state">El dispositivo no declara perfil OSI curado.</p>
  }

  React.useEffect(() => {
    void (async () => {
      const page = await devices.listByCategory(device.categoryCode, { limit: 20 })
      const filtradas = page.items.filter(
        (d: Device) => d.slug.value !== device.slug.value && (d.osiProfile?.terminatesAny(seleccion) ?? false),
      )
      setSimilares(filtradas)
    })()
  }, [seleccion, device, devices])

  const toggle = (num: number): void => {
    setSeleccion((prev) => (prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]))
  }

  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Perfil OSI</h2>
          <OsiPanel profile={perfil.profile} selected={seleccion} />
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Perfil TCP/IP (derivado)</h2>
          <p className="guia-tecnica">{(perfil.toTcpIpLayers() as readonly number[]).map((n) => `TCP/IP ${n}`).join(' · ')}</p>
          <h3 style={{ fontSize: 'var(--font-size-md)' }}>Consulta inversa por capas</h3>
          <div className="row" role="group" aria-label="Seleccionar capas">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={seleccion.includes(n)}
                onClick={() => toggle(n)}
                className="mono"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="guia-tecnica">Capas seleccionadas: {seleccion.join(', ')}</p>
        </div>
      </div>

      <section aria-label="Dispositivos que operan en estas capas">
        <h3 style={{ fontSize: 'var(--font-size-md)' }}>
          Misma categoría que termina las capas seleccionadas ({similares.length})
        </h3>
        {similares.length === 0 ? (
          <p className="guia-tecnica">Ningún otro dispositivo de esta categoría cubre la selección.</p>
        ) : (
          <ul style={{ paddingLeft: 20 }}>
            {similares.map((d) => (
              <li key={d.slug.value}>
                <Link to={`/device/${d.slug.value}`}>{d.name}</Link>{' '}
                <span className="mono guia-tecnica">
                  capa {d.osiProfile?.profile.primary}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="guia-tecnica" role="note">
        Los perfiles sin curación concreta heredan el de su categoría y se marcan como derivados (NET-HW-009).
      </p>
      <ConfidenceBadge confidence="derived" size="sm" />
    </div>
  )
}