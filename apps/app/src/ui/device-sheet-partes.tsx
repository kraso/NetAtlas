import React from 'react'
import { Link } from 'react-router-dom'
import { Breadcrumbs } from './breadcrumbs.js'
import { BotonFavorito } from './device-sheet-favorito.js'
import { useCategoria } from './device-sheet-hooks.js'

// Superficie del contenedor: la sincronización de favoritos también se usa aquí.
export { useSincronizarFavoritos } from './device-sheet-favorito.js'

/** Ficha de un slug que no existe en el dataset. */
export function NoEncontrado({ slug }: { slug: string }): React.JSX.Element {
  return (
    <section aria-labelledby="no-encontrado">
      <h1 id="no-encontrado">Dispositivo no encontrado</h1>
      <p>
        «<span className="mono">{slug}</span>» no existe en el dataset. <Link to="/explore">Volver al explorador</Link>.
      </p>
    </section>
  )
}

/** Cabecera de la ficha: migas, título, categoría, fabricante y favorito. */
export function CabeceraFicha({ device }: { device: import('@netatlas/domain').Device }): React.JSX.Element {
  const categoria = useCategoria(device)
  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Explorar', to: '/explore' },
          { label: device.name },
        ]}
      />
      <h1 id={`ficha-${device.slug.value}`}>{device.name}</h1>
      <p className="mono guia-tecnica">
        {device.slug.value} · {categoria} ·{' '}
        <Link to={`/fabricante/${device.manufacturerSlug}`}>{device.manufacturerSlug}</Link>{' '}
        <BotonFavorito device={device} />
      </p>
    </>
  )
}

interface PestañaDef {
  id: string
  label: string
  required?: boolean
}

const PESTAÑAS: readonly PestañaDef[] = [
  { id: 'resumen', label: 'Resumen', required: true },
  { id: 'especificaciones', label: 'Especificaciones' },
  { id: 'interfaces', label: 'Interfaces' },
  { id: 'protocolos', label: 'Protocolos' },
  { id: 'capacidades', label: 'Capacidades' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'capas', label: 'Capas OSI', required: true },
  { id: 'estandares', label: 'Estándares' },
  { id: 'compatibilidad', label: 'Compatibilidad' },
  { id: 'diagramas', label: 'Diagramas' },
  { id: 'historia', label: 'Historia' },
  { id: 'documentacion', label: 'Documentación' },
  { id: 'referencias', label: 'Referencias' },
]

/** Las 13 pestañas del plan (§10.5) como tablist accesible. */
export function TablistFicha({
  pestaña,
  setPestaña,
}: {
  pestaña: string
  setPestaña: (id: string) => void
}): React.JSX.Element {
  return (
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
  )
}
