import React from 'react'
import { Link } from 'react-router-dom'
import { OsiPanel, ConfidenceBadge } from '@netatlas/ui'
import { useServices } from '../composition-root.js'
import type { DatosPestana } from './device-sheet-hooks.js'

type Dispositivo = import('@netatlas/domain').Device
type Perfil = NonNullable<Dispositivo['osiProfile']>

/**
 * Estado de la consulta inversa por capas OSI (NET-HW-021 §8.4.2): capas
 * seleccionadas y dispositivos de la misma categoría que las terminan.
 * `activo` evita la consulta cuando el dispositivo no declara perfil OSI.
 */
function useOsi(device: Dispositivo, activo: boolean): {
  seleccion: readonly number[]
  toggle: (num: number) => void
  similares: readonly Dispositivo[]
} {
  const { devices } = useServices.getState().services
  const [seleccion, setSeleccion] = React.useState<readonly number[]>([device.osiProfile?.profile.primary ?? 3])
  const [similares, setSimilares] = React.useState<readonly Dispositivo[]>([])

  React.useEffect(() => {
    if (!activo) return
    void (async () => {
      const page = await devices.listByCategory(device.categoryCode, { limit: 20 })
      const filtradas = page.items.filter(
        (d) => d.slug.value !== device.slug.value && (d.osiProfile?.terminatesAny(seleccion) ?? false),
      )
      setSimilares(filtradas)
    })()
  }, [seleccion, device, devices, activo])

  const toggle = (num: number): void => {
    setSeleccion((prev) => (prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]))
  }

  return { seleccion, toggle, similares }
}

function PerfilOsi({ perfil, seleccion }: { perfil: Perfil; seleccion: readonly number[] }): React.JSX.Element {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Perfil OSI</h2>
      <OsiPanel profile={perfil.profile} selected={seleccion} />
    </div>
  )
}

function ConsultaCapas({
  perfil,
  seleccion,
  toggle,
}: {
  perfil: Perfil
  seleccion: readonly number[]
  toggle: (num: number) => void
}): React.JSX.Element {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Perfil TCP/IP (derivado)</h2>
      <p className="guia-tecnica">{(perfil.toTcpIpLayers() as readonly number[]).map((n) => `TCP/IP ${n}`).join(' · ')}</p>
      <h3 style={{ fontSize: 'var(--font-size-md)' }}>Consulta inversa por capas</h3>
      <div className="row" role="group" aria-label="Seleccionar capas">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button key={n} type="button" aria-pressed={seleccion.includes(n)} onClick={() => toggle(n)} className="mono">
            {n}
          </button>
        ))}
      </div>
      <p className="guia-tecnica">Capas seleccionadas: {seleccion.join(', ')}</p>
    </div>
  )
}

function MismaCategoria({ similares }: { similares: readonly Dispositivo[] }): React.JSX.Element {
  return (
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
              <span className="mono guia-tecnica">capa {d.osiProfile?.profile.primary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Pestaña Capas OSI (NET-HW-021 §8.4.2): panel vertical + TCP/IP derivado
 * + consulta inversa "qué dispositivos operan en estas capas".
 */
export function TabCapas({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { device } = datos
  const perfil = device.osiProfile
  const { seleccion, toggle, similares } = useOsi(device, perfil !== undefined)
  if (!perfil) {
    return <p className="empty-state">El dispositivo no declara perfil OSI curado.</p>
  }
  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <PerfilOsi perfil={perfil} seleccion={seleccion} />
        <ConsultaCapas perfil={perfil} seleccion={seleccion} toggle={toggle} />
      </div>
      <MismaCategoria similares={similares} />
      <p className="guia-tecnica" role="note">
        Los perfiles sin curación concreta heredan el de su categoría y se marcan como derivados.
      </p>
      <ConfidenceBadge confidence="derived" size="sm" />
    </div>
  )
}
