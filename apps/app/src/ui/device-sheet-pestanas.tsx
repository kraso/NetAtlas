import React from 'react'
import { useDatosPestana, type DatosPestana } from './device-sheet-hooks.js'
import { Empty } from './device-sheet-piezas.js'
import {
  TabArquitectura,
  TabCapacidades,
  TabCapas,
  TabCompatibilidad,
  TabDiagramas,
  TabDocumentacion,
  TabEspecificaciones,
  TabEstandares,
  TabHistoria,
  TabInterfaces,
  TabProtocolos,
  TabReferencias,
  TabResumen,
} from './device-sheet-tabs.js'
import type { Device } from '@netatlas/domain'

/** Una pestaña por componente (§10.5), indexada por el id de la pestaña. */
const TABS: Readonly<Record<string, (props: { datos: DatosPestana }) => React.JSX.Element>> = {
  resumen: TabResumen,
  especificaciones: TabEspecificaciones,
  interfaces: TabInterfaces,
  protocolos: TabProtocolos,
  capacidades: TabCapacidades,
  arquitectura: TabArquitectura,
  capas: TabCapas,
  estandares: TabEstandares,
  compatibilidad: TabCompatibilidad,
  diagramas: TabDiagramas,
  historia: TabHistoria,
  documentacion: TabDocumentacion,
  referencias: TabReferencias,
}

/**
 * Despachador de las 13 pestañas (§10.5): reúne los datos una sola vez y
 * delega cada pestaña en su componente.
 */
export function PestanaContent({ device, pestaña }: { device: Device; pestaña: string }): React.JSX.Element {
  const datos = useDatosPestana(device)
  if (datos.loading) return <p role="status">Cargando…</p>
  const Pestana = TABS[pestaña]
  return Pestana ? <Pestana datos={datos} /> : <Empty message="Pestaña no disponible." />
}
