import React from 'react'
import { useParams } from 'react-router-dom'
import { useDeviceDeSlug } from './device-sheet-hooks.js'
import { CabeceraFicha, NoEncontrado, useSincronizarFavoritos } from './device-sheet-partes.js'
import { CuerpoFicha } from './device-sheet-cuerpo.js'

/**
 * Ficha de dispositivo (§10.5) — las 13 pestañas del plan:
 * Resumen · Especificaciones · Interfaces · Protocolos · Capacidades ·
 * Arquitectura · Capas OSI · Estándares · Compatibilidad · Diagramas ·
 * Historia · Documentación · Referencias.
 *
 * Cada pestaña se alimenta de los puertos del dominio (device, graph, sourcing);
 * donde el modelo aún no tiene datos se muestra un empty-state curado, nunca
 * datos inventados. El reparto vive en los módulos `device-sheet-*`:
 * `-hooks` (puertos del dominio), `-partes` (cabecera y pestañas),
 * `-cuerpo` (composición), `-pestanas` (despachador) y `-tabs-*` (pestañas).
 */
export function DeviceSheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const [pestaña, setPestaña] = React.useState<string>('resumen')
  useSincronizarFavoritos(slug)
  const { device, notFound } = useDeviceDeSlug(slug)

  if (notFound) return <NoEncontrado slug={slug} />
  if (!device) return <p role="status">Cargando ficha…</p>

  return (
    <section aria-labelledby={`ficha-${device.slug.value}`}>
      <CabeceraFicha device={device} />
      <CuerpoFicha device={device} pestaña={pestaña} setPestaña={setPestaña} />
    </section>
  )
}
