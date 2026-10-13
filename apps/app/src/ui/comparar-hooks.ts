import { useDatosComparador } from './comparar-datos.js'
import { combinar, useFiltrosComparador, type ComparadorVista } from './comparar-vista.js'

export type { ComparadorVista }

/**
 * Estado y manejadores del comparador (F5 / §18): selección desde el
 * querystring, cálculo del informe con el caso de uso compartido, sugerencias
 * del buscador, enlace compartible y exportaciones. La vista solo proyecta.
 */
export function useComparador(): ComparadorVista {
  return combinar(useDatosComparador(), useFiltrosComparador())
}