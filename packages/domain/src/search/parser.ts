import { CLAVES_DSL, consultaCon } from './ast.js'
import type { ClaveDsl, ConsultaDsl, DslTermino } from './ast.js'

/**
 * Parser del mini-lenguaje de consulta DSL→AST (NET-HW-012, F1).
 * Gramática (PLAN MAESTRO §12.2):
 *
 *   consulta := termino (ESP termino)*
 *   termino  := texto_libre | campo
 *   campo    := [modificador] clave ":" valor | clave ":" valor ".." valor
 *   modificador := "-" (negación) | "+" (requerido)
 *   valor    := ident | "texto entre comillas" | numero
 *
 * Semántica:
 *   - ":" igualdad o pertenencia (cat:sw, protocolo:ospf)
 *   - "a..b" rango numérico (velocidad:10..25, anio:2018..2023)
 *   - "-" negación (-estado:discontinued)
 *   - "+" AND requerido: +protocolo:ospf +protocolo:bgp exige AMBOS;
 *     sin "+", múltiples valores del mismo campo son OR
 *   - Campos desconocidos → error explicado con sugerencia de corrección
 */

export interface ParseError {
  readonly position: number
  readonly token: string
  readonly message: string
  readonly suggestion?: string
}

export interface ParseResult {
  readonly ok: boolean
  readonly ast?: ConsultaDsl
  readonly errores: readonly ParseError[]
}

const CAMPOS_NUMERICOS: readonly ClaveDsl[] = ['puertos', 'velocidad', 'capa', 'anio']
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
function sugerenciaPara(token: string, conocidas: readonly string[]): string | undefined {
  const t = token.toLowerCase()
  if (CAMPOS_SUGESTION[t]) return CAMPOS_SUGESTION[t]
  const cercana = conocidas.find((c) => c.toLowerCase() === t)
  if (cercana) return cercana
  // Distancia ≤ 2: alternativa al typo
  const edit = (a: string, b: string): number => {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
    for (let i = 0; i <= a.length; i++) dp[i]![0] = i
    for (let j = 0; j <= b.length; j++) dp[0]![j] = j
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        )
      }
    }
    return dp[a.length]![b.length]!
  }
  return conocidas.find((c) => edit(c, t) <= 2)
}

/** Tokeniza por espacios respetando comillas dobles (también en medio de token). */
function tokenize(input: string): { token: string; start: number }[] {
  const out: { token: string; start: number }[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    const start = i
    let cur = ''
    let inQuotes = false
    while (i < input.length) {
      const c = input[i]!
      if (c === '"') {
        inQuotes = !inQuotes
        i++
        continue
      }
      if (!inQuotes && (c === ' ' || c === '\t')) break
      cur += c
      i++
    }
    out.push({ token: cur, start })
  }
  return out
}

function parseTermino(tok: { token: string; start: number }, errores: ParseError[]): DslTermino | undefined {
  const { token, start } = tok

  // Modificador
  if (token.startsWith('-') || token.startsWith('+')) {
    const mod = token[0]!
    const resto = token.slice(1)
    if (resto.length === 0) {
      errores.push({ position: start, token, message: `Modificador "${mod}" sin operando.` })
      return undefined
    }
    const inner = parseTermino({ token: resto, start: start + 1 }, errores)
    if (!inner) return undefined
    return mod === '-' ? { kind: 'negacion', operando: inner } : { kind: 'requerido', operando: inner }
  }

  // Campo: clave:valor | clave:a..b
  const idxColon = token.indexOf(':')
  if (idxColon > 0) {
    const claveRaw = token.slice(0, idxColon).trim().toLowerCase()
    const resto = token.slice(idxColon + 1)
    const clave = (CLAVES_DSL as readonly string[]).includes(claveRaw) ? (claveRaw as ClaveDsl) : undefined
    if (!clave) {
      const sugerencia = sugerenciaPara(claveRaw, CLAVES_DSL)
      errores.push({
        position: start,
        token: claveRaw,
        message: `Campo desconocido: "${claveRaw}".`,
        suggestion: sugerencia ? `¿Quisiste decir "${sugerencia}"?` : `Campos válidos: ${CLAVES_DSL.join(', ')}.`,
      })
      return undefined
    }

    // Rango
    const idxRango = resto.indexOf('..')
    if (idxRango !== -1) {
      if (!CAMPOS_NUMERICOS.includes(clave)) {
        errores.push({
          position: start,
          token,
          message: `El campo "${clave}" no admite rango numérico (a..b).`,
          suggestion: `Los campos con rango son: ${CAMPOS_NUMERICOS.join(', ')}.`,
        })
        return undefined
      }
      const desde = Number(resto.slice(0, idxRango).trim())
      const hasta = Number(resto.slice(idxRango + 2).trim())
      if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) {
        errores.push({
          position: start,
          token,
          message: `Rango inválido: "${resto}".`,
          suggestion: 'Formato: clave:a..b con números y a ≤ b (p. ej. velocidad:10..25).',
        })
        return undefined
      }
      return { kind: 'rango', clave, desde, hasta }
    }

    // Igualdad
    const valor = resto.trim().replace(/"/g, '')
    if (valor.length === 0) {
      errores.push({ position: start, token, message: `Campo "${clave}" sin valor.`, suggestion: 'Formato: clave:valor (p. ej. cat:sw).' })
      return undefined
    }
    return { kind: 'igual', clave, valor }
  }

  // Texto libre
  if (token.startsWith(':')) {
    errores.push({ position: start, token, message: 'Se esperaba el nombre de un campo antes de ":".' })
    return undefined
  }
  return { kind: 'texto', value: token }
}

/** Parsea una consulta DSL completa. Nunca lanza: devuelve errores explicados. */
export function parseDsl(input: string): ParseResult {
  const errores: ParseError[] = []
  const tokens = tokenize(input)
  const terminos: DslTermino[] = []
  for (const tok of tokens) {
    const t = parseTermino(
      tok,
      errores, // pasamos el array; las funciones crudas añaden
    )
    if (t) terminos.push(t)
  }
  if (errores.length > 0) {
    return { ok: false, errores }
  }
  return { ok: true, ast: consultaCon(terminos), errores: [] }
}

/**
 * Campo DSL ⇒ condiciones de texto libre. Los tokens de texto libre se
 * recogen para la parte FTS del compilador.
 */
export function textoLibre(ast: ConsultaDsl): string {
  return ast.terminos
    .filter((t) => t.kind === 'texto')
    .map((t) => (t as { value: string }).value)
    .join(' ')
}