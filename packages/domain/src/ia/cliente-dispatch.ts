import type { ToolContext } from './tools.js'

export type { ToolContext } from './tools.js'

/**
 * Dispatch de herramientas del asistente (§21.1[3]): traduce cada llamada del
 * plan a una operación del ToolContext. El adaptador solo aporta datos; si una
 * herramienta no existe, se devuelve un error explícito en los datos.
 */

/** Ejecuta una llamada del plan contra el ToolContext correspondiente. */
export async function dispatch(
  herramienta: string,
  argumentos: Readonly<Record<string, unknown>>,
  ctx: ToolContext,
  textoBusquedaPlan?: string,
): Promise<unknown> {
  switch (herramienta) {
    case 'search_catalog':
      return await dispatcharSearchCatalog(argumentos, ctx, textoBusquedaPlan)
    case 'get_device':
      return (await ctx.getDevice(cadena(argumentos.slug))) ?? {}
    case 'compare_devices':
      return await ctx.compareDevices(cadenas(argumentos.ids))
    case 'find_compatible':
      return await ctx.findCompatible(cadena(argumentos.device), constraint(argumentos))
    case 'build_topology':
      return await ctx.buildTopology(specConDescripcion(argumentos, textoBusquedaPlan))
    case 'what_layers':
      return (await ctx.whatLayers(cadena(argumentos.slug))) ?? {}
    case 'successors':
      return { resultados: await ctx.successors(cadena(argumentos.slug)) }
    default:
      return { error: `Herramienta desconocida: ${herramienta}` }
  }
}

/** Búsqueda con DSL; sin DSL se usa la frase del plan como texto libre. */
async function dispatcharSearchCatalog(
  argumentos: Readonly<Record<string, unknown>>,
  ctx: ToolContext,
  textoBusquedaPlan?: string,
): Promise<unknown> {
  const dslRaw = typeof argumentos.dsl === 'string' ? argumentos.dsl : ''
  const dsl = dslRaw.trim().length > 0 ? dslRaw : (textoBusquedaPlan ?? '')
  const limit = typeof argumentos.limit === 'number' ? argumentos.limit : 5
  return { resultados: await ctx.searchCatalog(dsl, limit) }
}

/** La comprensión envía {name}; el adaptador recibe la frase como descripción. */
function specConDescripcion(
  argumentos: Readonly<Record<string, unknown>>,
  textoBusquedaPlan?: string,
): Readonly<Record<string, unknown>> {
  if (textoBusquedaPlan === undefined) return argumentos
  return { ...argumentos, descripcion: String(textoBusquedaPlan) }
}

function constraint(argumentos: Readonly<Record<string, unknown>>): string | undefined {
  return argumentos.constraint === undefined ? undefined : String(argumentos.constraint)
}

function cadena(valor: unknown): string {
  return String(valor ?? '')
}

function cadenas(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map(String) : []
}
