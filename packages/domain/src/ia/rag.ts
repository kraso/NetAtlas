/**
 * RAG con citas obligatorias (sección 21.1[3][4], NET-HW-060).
 *
 * El contrato es explícito: el adaptador recupera contexto (hechos con fuente)
 * y ESTE módulo redacta la respuesta SOLO con ese contexto. El guardarraíl de
 * honestidad: si no hay datos validados, lo dice — nunca inventa una cifra.
 */
import type { CitaIA, RespuestaIA } from './assistant.js'

/** Un hecho recuperado de la base validada (assertion o dato de catálogo). */
export interface HechoIA {
  readonly sujeto: string
  readonly sujetoSlug: string
  readonly tipoSujeto: string
  /** Predicado o campo (p. ej. "throughput_gbps", "fabricante"). */
  readonly predicado: string
  /** Valor legible (p. ej. "256 Gbps", "Cisco Systems"). */
  readonly valor: string
  /** Fuente documental si la afirmación la tiene. */
  readonly fuenteSlug?: string | undefined
  /** Etiqueta de la fuente (título) para la cita. */
  readonly fuenteTitulo?: string | undefined
}

export interface ContextoRecuperado {
  readonly hechos: readonly HechoIA[]
  /** Texto que emparejó la recuperación (para explicar el plan). */
  readonly consulta?: string | undefined
}

/** Contexto vacío (candidato a respuesta honesta "no tengo datos"). */
export function contextoVacio(): ContextoRecuperado {
  return { hechos: [] }
}

export function citaDeHecho(h: HechoIA): CitaIA {
  return {
    tipo: h.tipoSujeto,
    slug: h.sujetoSlug,
    etiqueta: h.sujeto,
    fuenteSlug: h.fuenteSlug,
    afirmacion: `${h.predicado}: ${h.valor}`,
  }
}

/** Única cita por (tipo,slug,predicado) para no duplicar en la respuesta. */
function citasUnicas(hechos: readonly HechoIA[]): readonly CitaIA[] {
  const vistos = new Set<string>()
  const out: CitaIA[] = []
  for (const h of hechos) {
    const key = `${h.tipoSujeto}:${h.sujetoSlug}:${h.predicado}`
    if (vistos.has(key)) continue
    vistos.add(key)
    out.push(citaDeHecho(h))
  }
  return out
}

/** Construye la frase legible de un hecho ("256 Gbps", "fabricante → Cisco"). */
export function fraseDeHecho(h: HechoIA): string {
  if (h.predicado === 'fabricante') return `fabricado por ${h.valor}`
  if (h.predicado === 'categoria') return `de la categoría ${h.valor}`
  if (h.predicado === 'lanza') return `lanzado en ${h.valor}`
  return `${h.predicado.replace(/_/g, ' ')} de ${h.valor}`
}

/**
 * Redacta la respuesta con citas a partir del contexto recuperado.
 * El adaptador decide el estilo; este módulo garantiza que TODO lo afirmado
 * existe en `contexto` — no hay interpolación de datos inventados.
 */
export function responderConContexto(
  contexto: ContextoRecuperado,
  tema: string,
  opts?: { comoExplicacion?: boolean },
): RespuestaIA {
  const hechos = contexto.hechos
  if (hechos.length === 0) {
    return {
      texto: `No tengo datos validados sobre "${tema}". En NetAtlas solo respondo desde la base verificada (assertions con fuente); si crees que este dato debería existir, puedes importarlo o dejarlo en la cola de revisión desde /calidad.`,
      citas: [],
      herramientas: [],
      esExplicacion: false,
      modo: 'no-tengo-datos',
    }
  }

  const porSujeto = new Map<string, HechoIA[]>()
  for (const h of hechos) {
    const arr = porSujeto.get(h.sujetoSlug) ?? []
    arr.push(h)
    porSujeto.set(h.sujetoSlug, arr)
  }

  const parrafos: string[] = []
  for (const [slug, grupo] of porSujeto) {
    const principal = grupo[0]!
    const detalle = grupo
      .slice(0, 6)
      .map((h) => fraseDeHecho(h))
      .join('; ')
    parrafos.push(`${principal.sujeto}: ${detalle}.`)
  }

  const intro =
    opts?.comoExplicacion === true
      ? `Explicación generada a partir del catálogo verificado (sin especificaciones nuevas):`
      : `Según lo verificado en NetAtlas:`

  return {
    texto: `${intro}\n${parrafos.join('\n')}`,
    citas: citasUnicas(hechos),
    herramientas: [],
    esExplicacion: opts?.comoExplicacion === true,
    modo: opts?.comoExplicacion === true ? 'explicacion' : 'respuesta',
  }
}

// ── Guardarraíl de alucinaciones (eval) ──────────────────────────────────────

/**
 * Verifica que ninguna afirmación de la respuesta invente especificaciones:
 * todo par (sujetoSlug, predicado, valor) debe estar en el contexto recuperado.
 * Devuelve la lista de afirmaciones sospechosas (vacía = 0 alucinaciones).
 */
export function verificarAlucinaciones(
  respuesta: RespuestaIA,
  contexto: ContextoRecuperado,
): readonly string[] {
  if (respuesta.modo === 'no-tengo-datos') return []
  const legales = new Set(contexto.hechos.map((h) => `${h.sujetoSlug}|${h.predicado}|${h.valor.toLowerCase()}`))
  const sospechosas: string[] = []
  for (const c of respuesta.citas) {
    if (!c.afirmacion) continue
    const [predicado, valor] = c.afirmacion.split(': ')
    if (!predicado || !valor) continue
    if (!legales.has(`${c.slug}|${predicado}|${valor.toLowerCase()}`)) {
      sospechosas.push(`${c.slug}: ${c.afirmacion}`)
    }
  }
  return sospechosas
}

/** Conjunto de slugs citados en la respuesta. */
export function slugsCitados(respuesta: RespuestaIA): readonly string[] {
  return [...new Set(respuesta.citas.map((c) => c.slug))]
}