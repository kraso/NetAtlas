import React from 'react'
import type { Core } from 'cytoscape'
import type { Topology } from '@netatlas/domain'
import { rutaTopologia } from './topology-model.js'
import {
  limpiarTimers,
  animarRuta,
  manejarTapEnFlujo,
  type RefsFlujo,
} from './topology-flujo-logica.js'

export { rutaTopologia }

export type { RefsFlujo } from './topology-flujo-logica.js'

export interface FlujoPaquetes {
  readonly flujoActivo: boolean
  readonly origen: string | undefined
  readonly ruta: readonly string[]
  readonly alternarFlujo: () => void
  readonly onTapNode: (id: string) => void
}

/** Estado y refs del flujo: modo activo, origen, destino y ruta resaltada. */
interface EstadoFlujo {
  readonly flujoActivo: boolean
  readonly setFlujoActivo: (v: boolean) => void
  readonly origen: string | undefined
  readonly setOrigen: (v: string | undefined) => void
  readonly setDestino: (v: string | undefined) => void
  readonly ruta: readonly string[]
  readonly setRuta: (v: readonly string[]) => void
  readonly refs: RefsFlujo
}

/**
 * Flujo de paquetes animado (NET-HW-035): selección de origen/destino por
 * tap, BFS de ruta no dirigida y resaltado por saltos (`.enRuta` en
 * Cytoscape). Fuera del modo flujo, el tap navega a la ficha del nodo.
 *
 * La lógica de state machine, timers y animación está en
 * `topology-flujo-logica.ts`.
 */

export function useFlujoPaquetes(
  topologia: Topology,
  cyRef: React.RefObject<Core | undefined>,
  navegar: (to: string) => void,
): FlujoPaquetes {
  const est = useEstadoFlujo()

  const animar = (rutaIds: readonly string[]): void => {
    const cy = cyRef.current
    if (!cy) return
    animarRuta(cy, est.refs.timers, rutaIds, () => est.setFlujoActivo(false))
  }

  const onTapNode = useTapNodo(topologia, navegar, est, animar)
  return {
    flujoActivo: est.flujoActivo,
    origen: est.origen,
    ruta: est.ruta,
    alternarFlujo: () => alternar(est),
    onTapNode,
  }
}

/** Crea refs frescas para el state machine del flujo (hook: usa `React.useRef`). */
function useRefsFlujo(): RefsFlujo {
  return {
    flujoRef: React.useRef(false),
    origenRef: React.useRef<string | undefined>(undefined),
    destinoRef: React.useRef<string | undefined>(undefined),
    timers: React.useRef<number[]>([]),
  }
}

/** Estado del flujo + limpieza de timers al desmontar. */
function useEstadoFlujo(): EstadoFlujo {
  const [flujoActivo, setFlujoActivo] = React.useState(false)
  const [origen, setOrigen] = React.useState<string | undefined>()
  const [, setDestino] = React.useState<string | undefined>()
  const [ruta, setRuta] = React.useState<readonly string[]>([])
  const refs = useRefsFlujo()
  React.useEffect(limpiarTimers(refs.timers), [])
  return { flujoActivo, setFlujoActivo, origen, setOrigen, setDestino, ruta, setRuta, refs }
}

/** Tap en un nodo: en modo flujo lo consume; fuera, navega a su ficha. */
function useTapNodo(
  topologia: Topology,
  navegar: (to: string) => void,
  est: EstadoFlujo,
  animar: (r: readonly string[]) => void,
): (id: string) => void {
  const { refs } = est
  return React.useCallback(
    (id: string): void => {
      const ui = { setOrigen: est.setOrigen, setDestino: est.setDestino, setRuta: est.setRuta, setFlujoActivo: est.setFlujoActivo, animar }
      if (manejarTapEnFlujo(refs, topologia, id, ui)) return
      const nodo = topologia.nodeById(id)
      if (!nodo) return
      if (nodo.entityType === 'device') navegar(`/device/${nodo.entitySlug}`)
      else navegar(`/explore?cat=${nodo.entitySlug}`)
    },
    [topologia, navegar],
  )
}

/** Activa o desactiva el modo flujo, limpiando origen, destino y ruta. */
function alternar(est: EstadoFlujo): void {
  if (!est.flujoActivo) {
    est.refs.flujoRef.current = true
    est.setFlujoActivo(true)
    est.setRuta([])
    return
  }
  est.refs.flujoRef.current = false
  est.refs.origenRef.current = undefined
  est.refs.destinoRef.current = undefined
  est.setOrigen(undefined)
  est.setRuta([])
  est.setFlujoActivo(false)
}
