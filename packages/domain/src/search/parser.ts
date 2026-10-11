import { CLAVES_DSL, consultaCon } from './ast.js'
import { sugerenciaPara } from './parser-sugerencias.js'
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

/** Despacha un token a su forma: modificador, campo, error de ":" o texto libre. */
function parseTermino(tok: { token: string; start: number }, errores: ParseError[]): DslTermino | undefined {
  const { token, start } = tok
  if (token.startsWith('-') || token.startsWith('+')) return parseModificador(token, start, errores)
  const idxColon = token.indexOf(':')
  if (idxColon > 0) return parseCampo(token, start, idxColon, errores)
  if (token.startsWith(':')) {
    errores.push({ position: start, token, message: 'Se esperaba el nombre de un campo antes de ":".' })
    return undefined
  }
  return { kind: 'texto', value: token }
}

/** "-" niega y "+" exige su operando, que se parsea recursivamente. */
function parseModificador(token: string, start: number, errores: ParseError[]): DslTermino | undefined {
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

/** Resuelve la clave del campo; si no existe, registra el error y sugiere una cercana. */
function resolverClave(claveRaw: string, start: number, errores: ParseError[]): ClaveDsl | undefined {
  if ((CLAVES_DSL as readonly string[]).includes(claveRaw)) return claveRaw as ClaveDsl
  const sugerencia = sugerenciaPara(claveRaw, CLAVES_DSL)
  errores.push({
    position: start,
    token: claveRaw,
    message: `Campo desconocido: "${claveRaw}".`,
    suggestion: sugerencia ? `¿Quisiste decir "${sugerencia}"?` : `Campos válidos: ${CLAVES_DSL.join(', ')}.`,
  })
  return undefined
}

/** Campo "clave:…": reparte entre rango numérico e igualdad. */
function parseCampo(token: string, start: number, idxColon: number, errores: ParseError[]): DslTermino | undefined {
  const claveRaw = token.slice(0, idxColon).trim().toLowerCase()
  const clave = resolverClave(claveRaw, start, errores)
  if (!clave) return undefined
  const resto = token.slice(idxColon + 1)
  const idxRango = resto.indexOf('..')
  if (idxRango === -1) return parseIgual(token, start, clave, resto, errores)
  return parseRango(token, start, clave, resto, idxRango, errores)
}

/** Rango numérico "a..b", solo en campos numéricos y con a ≤ b. */
function parseRango(
  token: string,
  start: number,
  clave: ClaveDsl,
  resto: string,
  idxRango: number,
  errores: ParseError[],
): DslTermino | undefined {
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

/** Igualdad "clave:valor", con comillas opcionales alrededor del valor. */
function parseIgual(
  token: string,
  start: number,
  clave: ClaveDsl,
  resto: string,
  errores: ParseError[],
): DslTermino | undefined {
  const valor = resto.trim().replace(/"/g, '')
  if (valor.length === 0) {
    errores.push({ position: start, token, message: `Campo "${clave}" sin valor.`, suggestion: 'Formato: clave:valor (p. ej. cat:sw).' })
    return undefined
  }
  return { kind: 'igual', clave, valor }
}

/** Parsea una consulta DSL completa. Nunca lanza: devuelve errores explicados. */
export function parseDsl(input: string): ParseResult {
  const errores: ParseError[] = []
  const tokens = tokenize(input)
  const terminos: DslTermino[] = []
  for (const tok of tokens) {
    // parseTermino añade al array de errores pasado; nunca lanza.
    const t = parseTermino(tok, errores)
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