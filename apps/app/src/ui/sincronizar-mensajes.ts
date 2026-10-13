/**
 * Mensajes del ciclo de sincronización (F8A §23.4[3]): lo que le pasa a la
 * réplica lo decide el pull, y lo que le pasa a la cola lo decide el push. Sin
 * esta separación la vista puede decir a la vez que el pull falló y que la
 * réplica quedó actualizada.
 */

export interface ResultadoCiclo {
  readonly pullOk: boolean
  readonly pushOk: boolean
  readonly contribucionesPendientes: number
}

/** Motivos por los que el ciclo no se completó (vacío si ambos tramos fueron bien). */
export function motivosCiclo(r: ResultadoCiclo): readonly string[] {
  const motivos: string[] = []
  if (!r.pullOk) motivos.push('pull de catálogo sin red')
  if (!r.pushOk) motivos.push('push de cola sin confirmación')
  return motivos
}

/** Estado de la réplica: depende del pull, nunca del push. */
export function estadoReplica(pullOk: boolean): string {
  return pullOk ? ' La réplica quedó actualizada.' : ' La réplica conserva su versión anterior.'
}

/** Estado de la cola local: depende del push y del número de aportes sin confirmar. */
export function estadoCola(r: ResultadoCiclo): string {
  if (r.pushOk) return ''
  const n = r.contribucionesPendientes
  return ` Las contribuciones sin confirmar siguen pendientes${n > 0 ? ` (${n})` : ''}.`
}
