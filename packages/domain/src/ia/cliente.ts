import type { AssistantPort, PreguntaIA, RespuestaIA, ResultadoHerramienta } from './assistant.js'
import { comprender, type PlanIA } from './comprender.js'
import { dispatch, type ToolContext } from './cliente-dispatch.js'
import { contextoDesdeResultados } from './cliente-hechos.js'
import { responderConContexto } from './rag.js'

/**
 * Cliente del asistente: orquesta comprensión → herramientas → RAG con citas
 * (sección 21.1[1..5]). Es un cliente MÁS de la capa de aplicación: ejecuta
 * las herramientas vía `ToolContext` y redacta la respuesta con el módulo RAG.
 * El adaptador solo aporta datos; ninguna lógica de negocio vive aquí.
 *
 * El dispatch por herramienta vive en `cliente-dispatch.ts` y la conversión
 * de resultados a hechos con citas en `cliente-hechos.ts`.
 */

export { contextoDesdeResultados } from './cliente-hechos.js'
export type { ContextoRecuperado, HechoIA } from './rag.js'

export interface ClienteIAOptions {
  /** Modo explicación: marca las respuestas como "explicación generada". */
  readonly explicaciones?: boolean
  /** Etapa de comprensión alternativa (p. ej. LLM cloud, F7 futuro). */
  readonly comprender?: (texto: string, resolverSlug?: (t: string) => Promise<string | undefined>) => Promise<PlanIA>
}

/**
 * Construye un AssistantPort determinista local a partir de un ToolContext.
 * Sin LLM: comprensión por reglas + ejecución de herramientas + redacción
 * citada. Sustituible por un adaptador LLM cloud manteniendo el puerto.
 */
export function crearClienteIA(ctx: ToolContext, opts?: ClienteIAOptions): AssistantPort {
  const comprenderEtapa = opts?.comprender ?? comprender
  return {
    async ask(pregunta: PreguntaIA): Promise<RespuestaIA> {
      const plan = await comprenderEtapa(pregunta.texto, ctx.resolverEntidad?.bind(ctx))
      const resultados = await ejecutarPlan(plan, ctx)
      const contexto = contextoDesdeResultados(resultados, plan)

      const comoExplicacion = plan.escenario === 'explicacion-tecnica' || opts?.explicaciones === true
      const base = responderConContexto(contexto, plan.textoBusqueda ?? pregunta.texto, { comoExplicacion })

      // Adjunta las herramientas ejecutadas (transparencia §21.1[5]).
      return { ...base, herramientas: resultados }
    },
  }
}

/** Ejecuta las llamadas del plan en orden; falla suave por herramienta. */
export async function ejecutarPlan(
  plan: PlanIA,
  ctx: ToolContext,
): Promise<readonly ResultadoHerramienta[]> {
  const out: ResultadoHerramienta[] = []
  for (const llamada of plan.llamadas) {
    out.push(await ejecutarLlamada(llamada.herramienta, llamada.argumentos, ctx, plan.textoBusqueda))
  }
  return out
}

/** Una llamada: el fallo de la herramienta se convierte en dato explícito. */
async function ejecutarLlamada(
  herramienta: string,
  argumentos: Readonly<Record<string, unknown>>,
  ctx: ToolContext,
  textoBusqueda?: string,
): Promise<ResultadoHerramienta> {
  try {
    const datos = ((await dispatch(herramienta, argumentos, ctx, textoBusqueda)) ?? {}) as Readonly<Record<string, unknown>>
    return { herramienta, datos, sinDatos: Object.keys(datos).length === 0 }
  } catch (err) {
    return {
      herramienta,
      datos: { error: err instanceof Error ? err.message : String(err) },
      sinDatos: true,
    }
  }
}
