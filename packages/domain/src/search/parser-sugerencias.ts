/**
 * Sugerencias de corrección del parser DSL (NET-HW-012): alias de campos
 * frecuentes + Levenshtein corto (≤ 2) sobre los campos conocidos.
 */

const CAMPOS_SUGESTION: Record<string, string> = {
  ide: 'protocolo',
  fabr: 'fabricante',
  vel: 'velocidad',
  puerto: 'puertos',
  puertos: 'puertos',
  estandar: 'estandar',
  switch: 'cat',
  router: 'cat',
}

/** Distancia de Levenshtein pequeña para sugerencias de teclado. */
export function sugerenciaPara(token: string, conocidas: readonly string[]): string | undefined {
  const t = token.toLowerCase()
  if (CAMPOS_SUGESTION[t]) return CAMPOS_SUGESTION[t]
  const cercana = conocidas.find((c) => c.toLowerCase() === t)
  if (cercana) return cercana
  return conocidas.find((c) => distanciaLevenshtein(c, t) <= 2)
}

/** Distancia de edición entre dos cadenas cortas (DP clásica, sin dependencias). */
function distanciaLevenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length]![b.length]!
}
