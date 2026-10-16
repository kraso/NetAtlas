import type { Clock } from '@netatlas/domain'

/**
 * Relojes de los adaptadores de datos. El puerto `Clock` del dominio existe
 * para poder inyectar el tiempo en vez de leerlo por dentro; aquí viven las dos
 * implementaciones que usan los adaptadores.
 */

/** Reloj del sistema: el de todos los runtimes salvo el build del dataset. */
export const relojDelSistema: Clock = { now: () => new Date() }

/**
 * Reloj fijo: siempre el mismo instante. Lo inyecta `dataset:build` para que
 * dos construcciones de las mismas fuentes den el mismo SQLite —y por tanto el
 * mismo `sha256` en el manifiesto—: así el hash significa «contenido» y no
 * «cuándo se construyó», y el manifiesto versionado no se ensucia en cada
 * build. Un instante inválido rompe fuerte y temprano, no genera un dataset
 * con fechas basura.
 */
export function relojFijo(iso: string): Clock {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) {
    throw new Error(`relojFijo: instante inválido "${iso}" (se espera ISO 8601).`)
  }
  return { now: () => new Date(instante.getTime()) }
}
