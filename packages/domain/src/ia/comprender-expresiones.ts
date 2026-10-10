/**
 * Expresiones reconocidas por la comprensión determinista (§21.1[1]):
 * normalización de texto, alias de nombres comerciales → slug, velocidades
 * y limpieza de la frase. NUNCA inventa slugs: solo alias del catálogo real.
 */

/** Normaliza el texto: minúsculas sin tildes y colapsa espacios. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Alias de nombres comerciales del seed/demo → slug real del catálogo. */
const nombreASlug: ReadonlyArray<readonly [string, string]> = [
  ['catalyst 9300', 'cisco-c9300-48p'],
  ['c9300', 'cisco-c9300-48p'],
  ['9300', 'cisco-c9300-48p'],
  ['aruba 6300', 'aruba-6300m-48g'],
  ['6300m', 'aruba-6300m-48g'],
  ['2930f', 'aruba-2930f-48g'],
  ['2930', 'aruba-2930f-48g'],
  ['ccr1036', 'mikrotik-ccr1036'],
  ['ccr', 'mikrotik-ccr1036'],
  ['fortigate 200f', 'fortinet-200f'],
  ['200f', 'fortinet-200f'],
  ['9120', 'cisco-9120axi'],
  ['9120axi', 'cisco-9120axi'],
  ['fortinet', 'fortinet-200f'],
  ['fortigate', 'fortinet-200f'],
  ['mikrotik', 'mikrotik-ccr1036'],
  ['aruba', 'aruba-6300m-48g'],
  ['cisco', 'cisco-c9300-48p'],
]

/** Detecta un slug conocido por nombre comercial (catálogo real del seed/demo). */
export function detectarSlug(textoNormalizado: string): string | undefined {
  for (const [nombre, slug] of nombreASlug) {
    if (textoNormalizado.includes(nombre)) return slug
  }
  // Slugs de catálogo reales: `cisco-c9300-48p` etc.
  const m = textoNormalizado.match(/(?:[a-z0-9-]+)-[a-z0-9]+(?:-[a-z0-9]+)+/)
  return m?.[0] ?? undefined
}

/** Extrae velocidades "10 Gbps" / "interfaces de 10 G" / "10000 mbps" → Mbps. */
export function extraerVelocidadMbps(textoNormalizado: string): number | undefined {
  const g = textoNormalizado.match(/(\d+(?:[.,]\d+)?)\s*gbps\b/)
  if (g) return Math.round(parseFloat(g[1]!.replace(',', '.')) * 1000)
  const gs = textoNormalizado.match(/(\d+(?:[.,]\d+)?)\s*g\b/)
  if (gs) return Math.round(parseFloat(gs[1]!.replace(',', '.')) * 1000)
  const m = textoNormalizado.match(/(\d+(?:[.,]\d+)?)\s*mbps\b/)
  if (m) return Math.round(parseFloat(m[1]!.replace(',', '.')))
  return undefined
}

/** Quita ruido de la frase de diagrama para pasárselo al generador de topología. */
export function textoSinRuido(textoNormalizado: string): string {
  return textoNormalizado.replace(/^(topologia|diagrama|grafo|red)\s+(de\s+|con\s+)?/, '').trim()
}
