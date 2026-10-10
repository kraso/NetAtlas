import React from 'react'
import type { Topology } from '@netatlas/domain'
import { reordenarLayout, guardarLayout } from './topology-layout-logica.js'

/**
 * Persistencia del layout del visor (NET-HW-033 + F4 refinamiento): el
 * reordenado por capas se calcula en un Web Worker (nunca bloquea el hilo
 * principal) y ambos caminos —reordenar y arrastrar— persisten el resultado
 * como layout de usuario.
 *
 * La orquestación del worker y guardado está en `topology-layout-logica.ts`.
 */

export interface PersistenciaLayout {
  readonly reordenando: boolean
  /** Motivo visible si el reordenado falló (el usuario lo ha pedido él). */
  readonly errorReordenado: string | undefined
  readonly reordenar: () => Promise<void>
  readonly guardarLayout: (positions: ReadonlyArray<{ id: string; x: number; y: number }>) => void
}

export function usePersistenciaLayout(
  topologia: Topology,
  onCambio: (t: Topology) => void,
  alAplicarLayout: () => void,
): PersistenciaLayout {
  const [reordenando, setReordenando] = React.useState(false)
  const [errorReordenado, setErrorReordenado] = React.useState<string | undefined>()

  const reordenar = async (): Promise<void> => {
    if (reordenando) return
    setReordenando(true)
    setErrorReordenado(undefined)
    try {
      await reordenarLayout(topologia, onCambio, alAplicarLayout)
    } catch (err) {
      console.error('usePersistenciaLayout.reordenar: falló el reordenado:', err)
      setErrorReordenado(err instanceof Error ? err.message : 'No se pudo reordenar el diagrama.')
    } finally {
      setReordenando(false)
    }
  }

  return {
    reordenando,
    errorReordenado,
    reordenar,
    guardarLayout: (positions) => guardarLayout(topologia, onCambio, positions),
  }
}
