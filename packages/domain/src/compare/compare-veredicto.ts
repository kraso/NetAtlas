import type { ComparisonRow } from './compare-contratos.js'

/**
 * Veredicto por plantilla determinista del comparador (§18.2): frases
 * derivadas solo de las filas del reporte, nunca inventadas por IA.
 */

/** Frase fija cuando ningún atributo del reporte muestra diferencias. */
const fraseSinDiferencias = 'Según los datos comparados, no hay diferencias significativas entre estos dispositivos.'

/**
 * Veredicto completo del reporte: diferencias por fila + avisos de contexto.
 * Una fila sin diferencias no aporta nada; sin diferencias en todo el
 * reporte se dice explícitamente.
 */
export function construirVeredicto(
  rows: readonly ComparisonRow[],
  especificas: readonly { key: string; labelEs: string }[],
  transversal: boolean,
): readonly string[] {
  const porFila = rows.flatMap(destacarFila)
  const avisos = transversal ? [mensajeTransversal(especificas)] : []
  const sinDiferencias = rows.every((r) => r.allEqual) ? [fraseSinDiferencias] : []
  return [...porFila, ...avisos, ...sinDiferencias]
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

/** Líneas del veredicto para una fila con diferencias (mejor valor o detalle). */
function destacarFila(r: ComparisonRow): readonly string[] {
  if (r.allEqual) return []
  const bests = r.values.filter((v) => v.isBest)
  if (bests.length > 0 && (r.valueType === 'number' || r.valueType === 'range')) return fraseMejorValor(r, bests)
  const noIguales = r.values
    .filter((v) => v.display !== '—')
    .map((v) => `${v.deviceSlug}: ${v.display}`)
    .join(' · ')
  if (noIguales && bests.length === 0) return [`«${r.labelEs}» difiere entre los candidatos: ${noIguales}.`]
  return []
}

/** Frase de atributo numérico: quién destaca y por qué los demás pierden. */
function fraseMejorValor(r: ComparisonRow, bests: readonly { deviceSlug: string; display: string }[]): readonly string[] {
  const nomBests = bests.map((b) => `${b.deviceSlug} (${b.display})`).join(', ')
  const perdidas = r.values.filter((v) => v.lossReason).map((v) => `  ${v.lossReason}.`)
  return [`En «${r.labelEs}», destaca ${nomBests}.`, ...perdidas]
}

/** Aviso de comparación transversal (§18.4): qué atributos no se comparan. */
function mensajeTransversal(especificas: readonly { key: string; labelEs: string }[]): string {
  const n = especificas.length
  const lista = especificas.map((e) => e.labelEs).join(', ') || '—'
  return `Comparación transversal entre categorías: solo las filas comunes son directamente comparables; ${n} atributo${n === 1 ? '' : 's'} específico${n === 1 ? '' : 's'} no se comparan (${lista}).`
}
