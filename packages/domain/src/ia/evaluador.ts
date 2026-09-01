/**
 * Evaluación del asistente con conjunto de oro (sección 21.3 / NET-HW-060,
 * criterio F7: 0 alucinaciones de specs; citas correctas ≥ 95%).
 *
 * El evaluador es agnóstico del adaptador: recibe un puerto `AssistantPort`
 * y un ORÁCULO que verifica contra la base validada si un hecho citado existe
 * realmente. Así el criterio "no inventa specs" se comprueba contra los datos,
 * no contra la auto-declaración del asistente.
 */
import type { AssistantPort, RespuestaIA } from './assistant.js'
import type { HechoIA } from './rag.js'
import { verificarAlucinaciones, slugsCitados } from './rag.js'

/** Un hecho esperado en la respuesta de oro. */
export interface HechoEsperado {
  readonly sujetoSlug: string
  readonly predicado: string
  /** Valor exacto o un fragmento que debe contener. */
  readonly valor: string
}

export interface PreguntaOro {
  readonly pregunta: string
  /** Hechos que la respuesta correcta debe citar. */
  readonly hechosEsperados: readonly HechoEsperado[]
}

/** Oráculo: ¿existe este hecho en la base validada? El adaptador lo implementa. */
export type OracleHechos = (h: HechoIA) => Promise<boolean>

/** Un hecho afirmado por el asistente (extraído de sus citas). */
export interface HechoAfirmado {
  readonly sujetoSlug: string
  readonly predicado: string
  readonly valor: string
}

/** Extrae (sujeto, predicado, valor) de las citas de la respuesta. */
export function hechosDeRespuesta(respuesta: RespuestaIA): readonly HechoAfirmado[] {
  const out: HechoAfirmado[] = []
  for (const c of respuesta.citas) {
    if (!c.afirmacion) continue
    const sep = c.afirmacion.indexOf(': ')
    if (sep === -1) continue
    out.push({
      sujetoSlug: c.slug,
      predicado: c.afirmacion.slice(0, sep),
      valor: c.afirmacion.slice(sep + 2),
    })
  }
  return out
}

export interface EvalResultado {
  readonly total: number
  /** Preguntas con respuesta modo 'respuesta' o 'explicacion'. */
  readonly respondidas: number
  /** Preguntas honestas 'no-tengo-datos' (esperado 0 en el conjunto de oro). */
  readonly sinDatos: number
  readonly citasTotales: number
  readonly citasValidas: number
  /** citasValidas / citasTotales (objetivo ≥ 0.95). */
  readonly fidelidadCitas: number
  /** Afirmaciones citadas que NO existen en la base (debe ser 0). */
  readonly alucinacionesSpecs: number
  readonly detalleAlucinaciones: readonly string[]
  /** 1 - alucinaciones / citasTotales (objetivo 1). */
  readonly honestidad: number
  readonly aprobado: boolean
}

/**
 * Ejecuta el conjunto de oro contra el puerto y mide fidelidad de citas y
 * alucinaciones. `desnormalizar` opcional: valor → forma canónica.
 */
export async function evaluarConjuntoOro(
  port: AssistantPort,
  preguntas: readonly PreguntaOro[],
  oracle: OracleHechos,
): Promise<EvalResultado> {
  let respondidas = 0
  let sinDatos = 0
  let citasTotales = 0
  let citasValidas = 0
  const alucinaciones: string[] = []

  for (const q of preguntas) {
    const respuesta = await port.ask({ texto: q.pregunta })
    if (respuesta.modo === 'no-tengo-datos') {
      sinDatos++
      continue
    }
    respondidas++
    const hechos = hechosDeRespuesta(respuesta)
    citasTotales += hechos.length
    for (const h of hechos) {
      const existe = await oracle({ sujeto: '', sujetoSlug: h.sujetoSlug, tipoSujeto: 'device', predicado: h.predicado, valor: h.valor })
      if (existe) citasValidas++
      else alucinaciones.push(`${q.pregunta} → ${h.sujetoSlug}: ${h.predicado} = ${h.valor}`)
    }
  }

  const fidelidadCitas = citasTotales > 0 ? citasValidas / citasTotales : 1
  const alucinacionesSpecs = alucinaciones.length
  const honestidad = citasTotales > 0 ? 1 - alucinacionesSpecs / citasTotales : 1

  return {
    total: preguntas.length,
    respondidas,
    sinDatos,
    citasTotales,
    citasValidas,
    fidelidadCitas: Math.round(fidelidadCitas * 10000) / 10000,
    alucinacionesSpecs,
    detalleAlucinaciones: alucinaciones,
    honestidad: Math.round(honestidad * 10000) / 10000,
    aprobado: fidelidadCitas >= 0.95 && alucinacionesSpecs === 0,
  }
}

/**
 * Metáfora del guardarraíl §21.3 como función pura: el plan solo se despliega
 * si el evaluador aprueba. Devuelve el motivo si no.
 */
export function umbralDepliegue(resultado: EvalResultado): { despliega: boolean; motivo?: string } {
  if (resultado.alucinacionesSpecs > 0) {
    return { despliega: false, motivo: `Alucinaciones de specs: ${resultado.alucinacionesSpecs}.` }
  }
  if (resultado.fidelidadCitas < 0.95) {
    return {
      despliega: false,
      motivo: `Fidelidad de citas ${resultado.fidelidadCitas.toFixed(2)} < 0.95.`,
    }
  }
  return { despliega: true }
}

/** Cita de oro: verifica hechos esperados contra hechos afirmados. */
export function cubreHechosEsperados(
  afirmados: readonly HechoAfirmado[],
  esperados: readonly HechoEsperado[],
): boolean {
  for (const e of esperados) {
    const match = afirmados.some(
      (a) =>
        a.sujetoSlug === e.sujetoSlug &&
        a.predicado === e.predicado &&
        (a.valor === e.valor || a.valor.includes(e.valor) || e.valor.includes(a.valor)),
    )
    if (!match) return false
  }
  return true
}

export { verificarAlucinaciones, slugsCitados }