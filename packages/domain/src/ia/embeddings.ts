/**
 * Embeddings locales deterministas + índice vectorial + ranking híbrido
 * (sección 21.3 / NET-HW-016, ADR-06).
 *
 * Sin dependencias pesadas (sin ONNX/sqlite-vec en v1): vector TF-IDF sobre
 * tokens normalizados del catálogo, similitud coseno, y un ranking híbrido que
 * combina el score FTS (bm25, opaco) con la similitud vectorial. La interfaz
 * `SearchIndex` del dominio es estable: sustituir por sqlite-vec + ONNX en el
 * navegador no toca vistas ni viewmodels (ya documentado en ADR-06).
 */
export interface EntidadVectorizable {
  readonly slug: string
  /** Texto a vectorizar (p. ej. `${name} ${summary} ${protocolos} ${medios}`). */
  readonly texto: string
}

export interface VectorTFIDF {
  /** token → peso tf-idf (solo tokens con peso > 0). */
  readonly pesos: Readonly<Record<string, number>>
}

/** Normaliza un token: minúsculas, sin acentos, alfanumérico. */
export function tokenizar(texto: string): readonly string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 || /^\d+$/.test(t))
    .filter((t) => !STOPWORDS.has(t))
}

/** Detiene tokens de relleno (funciona sobre el corpus técnico en español). */
const STOPWORDS = new Set([
  'para', 'con', 'que', 'los', 'las', 'del', 'una', 'unas', 'uno', 'unos', 'este', 'esta', 'desde', 'hacia', 'entre', 'como', 'mas', 'muy', 'por', 'pero', 'tambien', 'tiene', 'puede', 'dispositivo', 'device', 'modelo', 'serie', 'red', 'networks', 'capa', 'puertos', 'gbps', 'mbps', 'necesito', 'quiero', 'estoy', 'estan', 'son', 'cual', 'cuales',
])

function tokensFiltrados(texto: string): string[] {
  return tokenizar(texto) as string[]
}

/** Cuenta de tokens por entidad (para df e idf). */
function conteosPorEntidad(entidades: readonly EntidadVectorizable[]): Map<string, Map<string, number>> {
  const porEntidad = new Map<string, Map<string, number>>()
  for (const e of entidades) {
    const conteo = new Map<string, number>()
    for (const t of tokensFiltrados(e.texto)) conteo.set(t, (conteo.get(t) ?? 0) + 1)
    porEntidad.set(e.slug, conteo)
  }
  return porEntidad
}

/** Índice vectorial TF-IDF construido sobre el corpus (determinista). */
export class IndiceVectorialTFIDF {
  private readonly df = new Map<string, number>()
  private readonly vectores = new Map<string, VectorTFIDF>()

  private constructor(
    private readonly entidades: readonly EntidadVectorizable[],
    private readonly idf: Readonly<Record<string, number>>,
  ) {}

  static construir(entidades: readonly EntidadVectorizable[]): IndiceVectorialTFIDF {
    const N = Math.max(1, entidades.length)
    const df = new Map<string, number>()
    const porEntidad = conteosPorEntidad(entidades)
    for (const conteo of porEntidad.values()) {
      for (const token of conteo.keys()) df.set(token, (df.get(token) ?? 0) + 1)
    }
    const idf: Record<string, number> = {}
    // idf = ln(1 + N/df) — suave, evita pesos extremos en corpus pequeños.
    for (const [token, n] of df) idf[token] = Math.log(1 + N / n)

    const idx = new IndiceVectorialTFIDF(entidades, idf)
    for (const e of entidades) {
      const conteo = porEntidad.get(e.slug) ?? new Map<string, number>()
      const pesos: Record<string, number> = {}
      for (const [token, n] of conteo) {
        const w = n * (idf[token] ?? 0)
        if (w > 0) pesos[token] = w
      }
      idx.vectores.set(e.slug, { pesos })
    }
    return idx
  }

  get tamaño(): number {
    return this.entidades.length
  }

  vector(slug: string): VectorTFIDF | undefined {
    return this.vectores.get(slug)
  }

  /** Vector de la consulta sobre el mismo vocabulario del corpus. */
  private vectorConsulta(texto: string): VectorTFIDF {
    const conteo = new Map<string, number>()
    for (const t of tokensFiltrados(texto)) conteo.set(t, (conteo.get(t) ?? 0) + 1)
    const pesos: Record<string, number> = {}
    for (const [token, n] of conteo) {
      const w = n * (this.idf[token] ?? 0)
      if (w > 0) pesos[token] = w
    }
    return { pesos }
  }

  /** Coseno entre dos vectores TF-IDF (0 si alguno es vacío). */
  static coseno(a: VectorTFIDF, b: VectorTFIDF): number {
    let dot = 0
    let na = 0
    let nb = 0
    for (const [t, w] of Object.entries(a.pesos)) {
      na += w * w
      if (b.pesos[t] !== undefined) dot += w * b.pesos[t]!
    }
    for (const w of Object.values(b.pesos)) nb += w * w
    if (na === 0 || nb === 0) return 0
    return dot / (Math.sqrt(na) * Math.sqrt(nb))
  }

  /** Los k más similares a la consulta, ordenados de mayor a menor. */
  buscar(texto: string, k: number): readonly { slug: string; score: number }[] {
    const q = this.vectorConsulta(texto)
    const scored = this.entidades.map((e) => {
      const v = this.vectores.get(e.slug)!
      return { slug: e.slug, score: IndiceVectorialTFIDF.coseno(q, v) }
    })
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}

// ── Ranking híbrido (lexical + vectorial) ────────────────────────────────────

export interface HitLexico {
  readonly slug: string
  /** Score opaco del índice FTS (bm25: negativo = mejor rank). */
  readonly score: number
}

export interface HitHibrido {
  readonly slug: string
  /** 0..1 — peso combinado normalizado. */
  readonly score: number
  readonly fuente: 'lexico' | 'vectorial' | 'ambos'
}

/**
 * Combina hits léxicos y vectoriales. bm25 de SQLite es negativo (mejor más
 * cercano a 0); se normaliza a [0,1] por rango, no por valor, para ser
 * robusto. Un slug presente en ambas fuentes sube (evidencia cruzada).
 */
export function rankingHibrido(
  lexicos: readonly HitLexico[],
  vectoriales: readonly { slug: string; score: number }[],
  k: number,
): readonly HitHibrido[] {
  const nLex = Math.max(1, lexicos.length)
  const nVec = Math.max(1, vectoriales.length)

  const rankLex = new Map<string, number>()
  // bm25 es negativo; ordenar por score asc = mejor primero.
  const ordenLex = [...lexicos].sort((a, b) => a.score - b.score)
  ordenLex.forEach((h, i) => rankLex.set(h.slug, 1 - i / nLex))

  const rankVec = new Map<string, number>()
  const ordenVec = [...vectoriales].sort((a, b) => b.score - a.score)
  ordenVec.forEach((h, i) => rankVec.set(h.slug, h.score * (1 - i / nVec)))

  const slugs = new Set([...rankLex.keys(), ...rankVec.keys()])
  const out: HitHibrido[] = []
  for (const slug of slugs) {
    const l = rankLex.get(slug)
    const v = rankVec.get(slug)
    const score = (l ?? 0) * 0.6 + (v ?? 0) * 0.4
    out.push({
      slug,
      score,
      fuente: l !== undefined && v !== undefined ? 'ambos' : l !== undefined ? 'lexico' : 'vectorial',
    })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k)
}