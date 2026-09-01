/**
 * Dedup con scoring y cola de reconciliación (§19.2-4, NET-HW-045).
 * Puro y determinista: compara un registro entrante contra uno existente y
 * decide fusión automática (score ≥ 0.98) o candidato a revisión humana
 * (0.7–0.98) con diff lado a lado. Nada se fusiona sin revisión si el score
 * es menor que el umbral de fusión (principio §19.2-4).
 */

/** Campos comparables del registro para el scoring. */
export interface DedupCandidate {
  readonly manufacturerSlug: string
  readonly name: string
  readonly model?: string | undefined
  readonly sku?: string | undefined
  readonly categoryCode?: string | undefined
}

export interface DedupResult {
  /** Similitud 0..1 (1 = mismo dispositivo con alta confianza). */
  readonly score: number
  /** Campos que coinciden (sinónimos de identidad). */
  readonly coincidencias: readonly string[]
  /** Campos que difieren entre candidato y existente (el diff lado a lado). */
  readonly diferencias: readonly { campo: string; entrante: string; existente: string }[]
  /** Umbrales del plan: fusión automática o candidato a revisión. */
  readonly decision: 'fusion-automatica' | 'candidato-revision' | 'distinto'
}

export const UMBRAL_FUSION = 0.98
export const UMBRAL_CANDIDATO = 0.7

/** Cadena de tokens normalizados (para similitud de nombres). */
export function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1)
}

/** Jaccard entre dos conjuntos de tokens (0..1). */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const setA = new Set(a)
  const inter = new Set(a.filter((t) => new Set(b).has(t)))
  return inter.size / new Set([...a, ...b]).size
}

export function dedupScore(entrante: DedupCandidate, existente: DedupCandidate): DedupResult {
  const coincidencias: string[] = []
  const diferencias: { campo: string; entrante: string; existente: string }[] = []
  let score = 0

  if (entrante.manufacturerSlug === existente.manufacturerSlug) {
    score += 0.35
    coincidencias.push('fabricante')
  } else {
    diferencias.push({ campo: 'fabricante', entrante: entrante.manufacturerSlug, existente: existente.manufacturerSlug })
  }

  const modA = (entrante.model ?? '').trim().toLowerCase()
  const modB = (existente.model ?? '').trim().toLowerCase()
  if (modA && modA === modB) {
    score += 0.4
    coincidencias.push('modelo')
  } else if (modA || modB) {
    diferencias.push({ campo: 'modelo', entrante: modA, existente: modB })
  }

  const skuA = (entrante.sku ?? '').trim()
  const skuB = (existente.sku ?? '').trim()
  if (skuA && skuB && skuA === skuB) {
    score += 0.15
    coincidencias.push('sku')
  }

  const nombreSim = jaccard(tokens(entrante.name), tokens(existente.name))
  score += 0.1 * nombreSim
  if (nombreSim >= 0.7) {
    coincidencias.push('nombre')
  } else if (nombreSim > 0) {
    diferencias.push({ campo: 'nombre', entrante: entrante.name, existente: existente.name })
  }

  if (entrante.categoryCode && existente.categoryCode && entrante.categoryCode !== existente.categoryCode) {
    diferencias.push({ campo: 'categoría', entrante: entrante.categoryCode, existente: existente.categoryCode })
  }

  score = Number(Math.min(1, score).toFixed(3))
  const decision: DedupResult['decision'] =
    score >= UMBRAL_FUSION ? 'fusion-automatica' : score >= UMBRAL_CANDIDATO ? 'candidato-revision' : 'distinto'
  return { score, coincidencias, diferencias, decision }
}

/** Diff genérico de campos (para el lado a lado del informe y la cola). */
export function diffCampos(
  entrante: Readonly<Record<string, unknown>>,
  existente: Readonly<Record<string, unknown>>,
): { campo: string; entrante: string; existente: string }[] {
  const campos = new Set([...Object.keys(entrante), ...Object.keys(existente)])
  const out: { campo: string; entrante: string; existente: string }[] = []
  for (const c of campos) {
    const a = entrante[c]
    const b = existente[c]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    out.push({ campo: c, entrante: a === undefined ? '—' : String(a), existente: b === undefined ? '—' : String(b) })
  }
  return out.sort((x, y) => x.campo.localeCompare(y.campo))
}