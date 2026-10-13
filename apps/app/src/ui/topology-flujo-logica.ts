import type { Core } from 'cytoscape'
import type { Topology } from '@netatlas/domain'
import { rutaTopologia } from './topology-model.js'

/**
 * Lógica del flujo de paquetes animado (NET-HW-035), extraída de
 * `topology-flujo.ts` para mantener el hook por debajo del límite de 200 líneas
 * (§Convenciones).
 *
 * Las funciones no usan React: reciben refs y callbacks como parámetros en
 * lugar de hooks, por lo que pueden testearse sin contexto de componente (sí
 * mutan las refs y los timers que reciben).
 */

/** Refs frescas del state machine del flujo. */
export interface RefsFlujo {
  readonly flujoRef: { current: boolean }
  readonly origenRef: { current: string | undefined }
  readonly destinoRef: { current: string | undefined }
  readonly timers: { current: number[] }
}

/** Callbacks de UI que el flujo necesita para reflejar su estado. */
export interface UiFlujo {
  readonly setOrigen: (v: string | undefined) => void
  readonly setDestino: (v: string | undefined) => void
  readonly setRuta: (v: readonly string[]) => void
  readonly setFlujoActivo: (v: boolean) => void
  readonly animar: (r: readonly string[]) => void
}

/** Limpia todos los timers al desmontar el hook. */
export function limpiarTimers(timers: { current: number[] }): (() => void) {
  return () => {
    for (const t of timers.current) clearTimeout(t)
  }
}

/** Resaltado progresivo por saltos: `.enRuta` sobre cada nodo de la ruta. */
export function animarRuta(
  cy: Core,
  timers: { current: number[] },
  rutaIds: readonly string[],
  onFlujoInactivo: () => void,
): void {
  cy.elements().removeClass('enRuta')
  rutaIds.forEach((id, i) => {
    timers.current.push(
      window.setTimeout(() => {
        cy.getElementById(id).addClass('enRuta')
        if (i === rutaIds.length - 1) onFlujoInactivo()
      }, i * 350),
    )
  })
}

/**
 * State machine de selección origen/destino durante el flujo activo.
 * Devuelve `true` si el tap se consumió en modo flujo.
 */
export function manejarTapEnFlujo(
  refs: RefsFlujo,
  topologia: Topology,
  id: string,
  ui: UiFlujo,
): boolean {
  if (!refs.flujoRef.current) return false
  const origen = refs.origenRef.current
  if (!origen) {
    refs.origenRef.current = id
    ui.setOrigen(id)
    return true
  }
  if (refs.destinoRef.current || id === origen) return true
  refs.destinoRef.current = id
  ui.setDestino(id)
  consumirDestino(refs, topologia, origen, id, ui)
  refs.origenRef.current = undefined
  refs.destinoRef.current = undefined
  ui.setOrigen(undefined)
  ui.setDestino(undefined)
  return true
}

/** Consume el destino elegido: anima la ruta o desactiva el flujo si no hay ninguna. */
function consumirDestino(
  refs: RefsFlujo,
  topologia: Topology,
  origen: string,
  destino: string,
  ui: UiFlujo,
): void {
  const ruta = rutaTopologia(topologia, origen, destino)
  ui.setRuta(ruta)
  if (ruta.length > 0) {
    ui.animar(ruta)
    return
  }
  refs.flujoRef.current = false
  ui.setFlujoActivo(false)
  ui.setRuta([])
}
