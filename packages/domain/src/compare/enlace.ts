/**
 * Enlace compartible con veredicto del comparador (F5 refinamiento).
 *
 * El reporte ya se recalcula deterministicamente desde `ids`; lo que aporta
 * persistir el veredicto en la querystring es una ETIQUETA de verificación:
 * un hash no criptográfico (FNV-1a, puro y determinista, sin node:crypto para
 * no romper la PWA) del resumen del veredicto. Al abrir el enlace, la UI
 * recalcula el reporte y compara: mismo hash ⇒ insignia "enlace verificado";
 * distinto ⇒ aviso de que los datos cambiaron (p. ej. seed actualizado).
 *
 * Liga con §18: el veredicto es por plantilla determinista, así que un enlace
 * compartido siempre reproduce el mismo veredicto — salvo que el dataset
 * cambie, y eso es justo lo que la etiqueta detecta.
 */

import type { ComparisonReport } from './motor.js'

/** Aplana el veredicto a una cadena canónica (estable y comparable). */
export function resumenVeredicto(report: Pick<ComparisonReport, 'veredicto' | 'transversal' | 'filasConDiferencias'>): string {
  const lineas = report.veredicto.map((v) => v.trim())
  return [
    `transversal=${report.transversal}`,
    `diferencias=${report.filasConDiferencias}`,
    ...lineas,
  ].join('\n')
}

/** Hash FNV-1a 32-bit en hex (puro, determinista; NO es criptográfico). */
export function etiquetaVeredicto(resumen: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < resumen.length; i++) {
    hash ^= resumen.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export interface EtiquetaVeredictoResultado {
  readonly hash: string
  readonly resumen: string
}

/** Genera la etiqueta canónica de un reporte (para `v=` en la URL). */
export function etiquetaDeReporte(report: ComparisonReport): EtiquetaVeredictoResultado {
  const resumen = resumenVeredicto(report)
  return { hash: etiquetaVeredicto(resumen), resumen }
}

/** ¿La etiqueta recibida en la URL corresponde a este reporte? */
export function verificarEtiqueta(report: ComparisonReport, etiqueta: string | null | undefined): boolean {
  if (!etiqueta) return false
  return etiquetaDeReporte(report).hash === etiqueta
}