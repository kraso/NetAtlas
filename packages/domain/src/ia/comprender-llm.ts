/**
 * Proveedor LLM cloud opcional para la comprensión (F7 futuro, §21.1[1]/§21.4).
 *
 * El LLM SOLO traduce la pregunta a un `PlanIA` (tool calls + escenario) que
 * el pipeline local ejecuta contra herramientas reales; la redacción de la
 * respuesta la hace `responderConContexto` con citas (jamás el LLM toca specs:
 * 0 alucinaciones por construcción, igual que el adaptador local).
 *
 * Contrato: endpoint OpenAI-compatible (`POST /v1/chat/completions`) que
 * devuelve JSON con el plan. Cualquier fallo (config ausente, red, JSON
 * inválido, herramientas desconocidas) cae al adaptador local determinista.
 */
import { esLlamadaValida } from './tools.js'
import { comprender } from './comprender.js'
import type { PlanIA, EscenarioIA } from './comprender.js'
import type { LlamadaHerramienta } from './assistant.js'

export interface ComprenderLLMOptions {
  readonly endpoint: string
  readonly apiKey: string
  readonly model: string
  /** Timeout en ms (default 8 s). */
  readonly timeoutMs?: number
  /** Inyectable para tests (parámetros de sistema como fetch). */
  readonly fetchImpl?: typeof fetch
  /** Sistema: da contexto del dominio y el formato exacto de respuesta. */
  readonly systemPrompt?: string
}

const ESCENARIOS: readonly EscenarioIA[] = [
  'asistente-tecnico',
  'generacion-diagramas',
  'explicacion-tecnica',
  'diagnostico',
  'comparacion',
  'busqueda',
  'no-entendido',
]

const SYSTEM_DEFAULT =
  `Eres el traductor NL→plan de la enciclopedia de hardware de redes NetAtlas. ` +
  `Responde SOLO con JSON: {escenario, llamadas:[{herramienta, argumentos}], textoBusqueda, slugPrincipal}. ` +
  `Escenario ∈ ${ESCENARIOS.join('|')}. ` +
  `Herramientas válidas: search_catalog (dsl), get_device (slug), compare_devices (ids), ` +
  `find_compatible (device, constraint), build_topology (name), what_layers (slug), successors (slug). ` +
  `Si no hay datos, pon escenario 'no-entendido'. Sin texto libre fuera del JSON.`

/** Plana un Objeto LLM (no tipado) a PlanIA seguro o undefined. */
function planDesdeJson(valor: unknown): PlanIA | undefined {
  if (typeof valor !== 'object' || valor === null) return undefined
  const v = valor as Record<string, unknown>
  const escenario = typeof v.escenario === 'string' ? (v.escenario as EscenarioIA) : undefined
  if (!escenario || !ESCENARIOS.includes(escenario)) return undefined
  const llamadasRaw = Array.isArray(v.llamadas) ? v.llamadas : []
  const llamadas: LlamadaHerramienta[] = []
  for (const l of llamadasRaw) {
    if (typeof l !== 'object' || l === null) continue
    const ll = l as Record<string, unknown>
    if (typeof ll.herramienta !== 'string' || !esLlamadaValida({ herramienta: ll.herramienta })) continue
    const argumentos = typeof ll.argumentos === 'object' && ll.argumentos !== null
      ? (ll.argumentos as Record<string, unknown>)
      : {}
    llamadas.push({ herramienta: ll.herramienta, argumentos })
  }
  return {
    escenario,
    llamadas,
    textoBusqueda: typeof v.textoBusqueda === 'string' ? v.textoBusqueda : undefined,
    slugPrincipal: typeof v.slugPrincipal === 'string' ? v.slugPrincipal : undefined,
  }
}

/**
 * Construye la etapa de comprensión con LLM cloud.
 * La función devuelta tiene el MISMO contrato que `comprender` y siempre cae
 * al local ante cualquier error → nunca deja al asistente sin plan válido.
 */
export function crearComprenderLLM(
  opts: ComprenderLLMOptions,
  local: typeof comprender = comprender,
): (texto: string, resolverSlug?: (t: string) => Promise<string | undefined>) => Promise<PlanIA> {
  return async (texto, resolverSlug) => {
    try {
      const fetchImpl = opts.fetchImpl ?? fetch
      const controlador = new AbortController()
      const timeout = setTimeout(() => controlador.abort(), opts.timeoutMs ?? 8000)
      const respuesta = await fetchImpl(opts.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: opts.systemPrompt ?? SYSTEM_DEFAULT },
            { role: 'user', content: texto },
          ],
        }),
        signal: controlador.signal,
      })
      clearTimeout(timeout)
      if (!respuesta.ok) throw new Error(`LLM HTTP ${respuesta.status}`)
      const cuerpo = (await respuesta.json()) as { choices?: readonly { message?: { content?: string } }[] }
      const contenido = cuerpo.choices?.[0]?.message?.content
      if (typeof contenido !== 'string' || contenido.trim().length === 0) throw new Error('LLM sin contenido')
      const plan = planDesdeJson(JSON.parse(contenido))
      if (!plan) throw new Error('LLM devolvió un plan inválido')
      return plan
    } catch {
      // Config ausente, red caída, JSON inválido o plan no seguro → local.
      return local(texto, resolverSlug)
    }
  }
}