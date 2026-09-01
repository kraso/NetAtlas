/**
 * Cliente del asistente: orquesta comprensión → herramientas → RAG con citas
 * (sección 21.1[1..5]). Es un cliente MÁS de la capa de aplicación: ejecuta
 * las herramientas vía `ToolContext` y redacta la respuesta con el módulo RAG.
 * El adaptador solo aporta datos; ninguna lógica de negocio vive aquí.
 */
import type { AssistantPort, PreguntaIA, RespuestaIA, ResultadoHerramienta } from './assistant.js'
import { comprender, type PlanIA } from './comprender.js'
import type { ToolContext } from './tools.js'
import { responderConContexto, contextoVacio } from './rag.js'
import type { ContextoRecuperado, HechoIA } from './rag.js'

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
      return {
        ...base,
        herramientas: resultados,
      }
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
    try {
      const datos = await dispatch(llamada.herramienta, llamada.argumentos, ctx, plan.textoBusqueda)
      const sinDatos = Object.keys(datos ?? {}).length === 0
      out.push({
        herramienta: llamada.herramienta,
        datos: (datos ?? {}) as Readonly<Record<string, unknown>>,
        sinDatos,
      })
    } catch (err) {
      out.push({
        herramienta: llamada.herramienta,
        datos: { error: err instanceof Error ? err.message : String(err) },
        sinDatos: true,
      })
    }
  }
  return out
}

async function dispatch(
  herramienta: string,
  argumentos: Readonly<Record<string, unknown>>,
  ctx: ToolContext,
  textoBusquedaPlan?: string,
): Promise<unknown> {
  switch (herramienta) {
    case 'search_catalog': {
      const dslRaw = typeof argumentos.dsl === 'string' ? argumentos.dsl : ''
      const dsl = dslRaw.trim().length > 0 ? dslRaw : (textoBusquedaPlan ?? '')
      const limit = typeof argumentos.limit === 'number' ? argumentos.limit : 5
      const resultados = await ctx.searchCatalog(dsl, limit)
      return { resultados }
    }
    case 'get_device': {
      const slug = String(argumentos.slug ?? '')
      return (await ctx.getDevice(slug)) ?? {}
    }
    case 'compare_devices': {
      const ids = Array.isArray(argumentos.ids) ? argumentos.ids.map(String) : []
      return await ctx.compareDevices(ids)
    }
    case 'find_compatible': {
      const device = String(argumentos.device ?? '')
      const constraint = argumentos.constraint === undefined ? undefined : String(argumentos.constraint)
      return await ctx.findCompatible(device, constraint)
    }
    case 'build_topology': {
      const spec = argumentos
      // La comprensión envía {name} y la frase en textoBusquedaPlan; el adaptador
      // parsea los roles con el generador de topologías (§21.2 escenario 2).
      const conTexto = textoBusquedaPlan
        ? { ...spec, descripcion: typeof textoBusquedaPlan === 'string' ? textoBusquedaPlan : String(textoBusquedaPlan) }
        : spec
      return await ctx.buildTopology(conTexto)
    }
    case 'what_layers': {
      const slug = String(argumentos.slug ?? '')
      return (await ctx.whatLayers(slug)) ?? {}
    }
    case 'successors': {
      const slug = String(argumentos.slug ?? '')
      const lista = await ctx.successors(slug)
      return { resultados: lista }
    }
    default:
      return { error: `Herramienta desconocida: ${herramienta}` }
  }
}

/**
 * Convierte los resultados planos de las herramientas en hechos con citas.
 * Cada hecho es trazable a su entidad; los valores vienen EXACTOS de los
 * datos devueltos (nunca interpolados/libres).
 */
export function contextoDesdeResultados(
  resultados: readonly ResultadoHerramienta[],
  plan: PlanIA,
): ContextoRecuperado {
  const hechos: HechoIA[] = []

  for (const r of resultados) {
    const d = r.datos
    switch (r.herramienta) {
      case 'search_catalog': {
        const lista = (d.resultados ?? []) as readonly { slug: string; nombre: string; categoria: string }[]
        for (const item of lista.slice(0, 8)) {
          hechos.push({
            sujeto: item.nombre,
            sujetoSlug: item.slug,
            tipoSujeto: 'device',
            predicado: 'categoria',
            valor: item.categoria,
          })
        }
        break
      }
      case 'get_device': {
        const slug = String(d.slug ?? '')
        const nombre = String(d.nombre ?? slug)
        if (d.fabricante !== undefined) {
          hechos.push({ sujeto: nombre, sujetoSlug: slug, tipoSujeto: 'device', predicado: 'fabricante', valor: String(d.fabricante) })
        }
        if (d.categoria !== undefined) {
          hechos.push({ sujeto: nombre, sujetoSlug: slug, tipoSujeto: 'device', predicado: 'categoria', valor: String(d.categoria) })
        }
        if (d.lanza !== undefined) {
          hechos.push({ sujeto: nombre, sujetoSlug: slug, tipoSujeto: 'device', predicado: 'lanza', valor: String(d.lanza) })
        }
        if (d.puertos !== undefined) {
          const puertos = Array.isArray(d.puertos) ? d.puertos : []
          const total = puertos.reduce((acc: number, p: { cantidad?: number }) => acc + (p.cantidad ?? 0), 0)
          hechos.push({ sujeto: nombre, sujetoSlug: slug, tipoSujeto: 'device', predicado: 'puertos', valor: String(total) })
        }
        if (Array.isArray(d.assertions)) {
          for (const a of d.assertions as readonly { predicado?: string; valor?: string; fuenteSlug?: string; fuenteTitulo?: string }[]) {
            if (!a.predicado || a.valor === undefined) continue
            hechos.push({
              sujeto: nombre,
              sujetoSlug: slug,
              tipoSujeto: 'device',
              predicado: a.predicado,
              valor: String(a.valor),
              fuenteSlug: a.fuenteSlug,
              fuenteTitulo: a.fuenteTitulo,
            })
          }
        }
        break
      }
      case 'compare_devices': {
        const filas = (d.diferencias ?? []) as readonly { clave: string; labelEs: string; valores: Record<string, string> }[]
        const dispositivos = (d.dispositivos ?? []) as readonly { slug: string; nombre: string }[]
        const nombres = new Map(dispositivos.map((x) => [x.slug, x.nombre]))
        for (const fila of filas) {
          for (const [slug, valor] of Object.entries(fila.valores ?? {})) {
            if (valor === '—' || valor === '') continue
            hechos.push({
              sujeto: nombres.get(slug) ?? slug,
              sujetoSlug: slug,
              tipoSujeto: 'device',
              predicado: 'comparacion',
              valor: `${fila.labelEs}: ${valor}`,
            })
          }
        }
        if (hechos.length === 0 && dispositivos.length > 0) {
          hechos.push({
            sujeto: dispositivos[0]!.nombre,
            sujetoSlug: dispositivos[0]!.slug,
            tipoSujeto: 'device',
            predicado: 'comparacion',
            valor: `comparación de ${dispositivos.length} dispositivos`,
          })
        }
        break
      }
      case 'find_compatible': {
        const dispositivo = String(d.dispositivo ?? '')
        const compatibles = (d.compatibles ?? []) as readonly { slug: string; nombre: string; via: string }[]
        for (const c of compatibles) {
          hechos.push({
            sujeto: c.nombre,
            sujetoSlug: c.slug,
            tipoSujeto: 'device',
            predicado: 'compatible con',
            valor: dispositivo,
          })
        }
        break
      }
      case 'what_layers': {
        const slug = String(d.slug ?? '')
        const nombre = String(d.nombre ?? slug)
        const termina = Array.isArray(d.termina) ? d.termina.join(', ') : ''
        const transparente = Array.isArray(d.transparente) ? d.transparente.join(', ') : ''
        if (termina) hechos.push({ sujeto: nombre, sujetoSlug: slug, tipoSujeto: 'device', predicado: 'capas que termina', valor: termina })
        if (transparente) hechos.push({ sujeto: nombre, sujetoSlug: slug, tipoSujeto: 'device', predicado: 'capas transparente', valor: transparente })
        break
      }
      case 'successors': {
        const resultados = (d.resultados ?? []) as readonly { relacion: string; slug: string; nombre: string }[]
        for (const s of resultados) {
          hechos.push({
            sujeto: s.nombre,
            sujetoSlug: s.slug,
            tipoSujeto: 'device',
            predicado: s.relacion === 'replaced-by' ? 'reemplaza a' : s.relacion === 'succeeds' ? 'sucede a' : 'precede a',
            valor: plan.slugPrincipal ?? '',
          })
        }
        break
      }
      case 'build_topology': {
        const slug = String(d.slug ?? '')
        const nombre = String(d.nombre ?? 'Topología generada')
        if (slug) {
          hechos.push({
            sujeto: nombre,
            sujetoSlug: slug,
            tipoSujeto: 'topology',
            predicado: 'topologia generada',
            valor: `${String(d.nodos ?? 0)} nodos`,
          })
        }
        break
      }
      default:
        break
    }
  }

  if (hechos.length === 0) return contextoVacio()
  return { hechos, consulta: plan.textoBusqueda ?? plan.llamadas.map((l) => l.herramienta).join(', ') }
}

export type { ContextoRecuperado, HechoIA }