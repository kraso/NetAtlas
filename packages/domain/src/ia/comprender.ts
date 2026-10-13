import type { PlanIA } from './comprender-contratos.js'
import { detectarSlug, normalizar } from './comprender-expresiones.js'
import {
  planAsistenteTecnico,
  planBusquedaLibre,
  planComparacion,
  planDiagrama,
  planDiagnostico,
  planExplicacion,
  planFichaExplicita,
  planSucesor,
} from './comprender-escenarios.js'

/**
 * Comprensión de lenguaje natural → plan de herramientas/consulta DSL
 * (sección 21.1[1] — adaptador local determinista; un proveedor LLM cloud
 * puede sustituir esta etapa manteniendo el mismo contrato de plan).
 *
 * Reconoce los cinco escenarios de §21.2 y emite llamadas a las herramientas
 * del catálogo (tools.ts). NUNCA inventa: si no reconoce nada, cae en el
 * escenario 'busqueda' con el texto libre, o en 'no-entendido'.
 *
 * Los contratos viven en `comprender-contratos.ts`, las expresiones en
 * `comprender-expresiones.ts`, el DSL en `comprender-dsl.ts` y los
 * constructores de plan por escenario en `comprender-escenarios.ts`.
 */

export type { EscenarioIA, PlanIA } from './comprender-contratos.js'
export { detectarSlug, extraerVelocidadMbps, normalizar, textoSinRuido } from './comprender-expresiones.js'

/**
 * Traduce una pregunta en lenguaje natural a un plan de ejecución.
 * `resolverSlug` opcional: el adaptador resuelve nombres comerciales reales
 * del catálogo (p. ej. "Catalyst 9300" → slug real del seed); sin él se usan
 * los alias canónicos del demo.
 *
 * Prioridad de escenarios: diagramas > comparación > explicación > diagnóstico
 * > ficha/capas/cantidades > búsqueda técnica > búsqueda libre.
 */
export async function comprender(
  texto: string,
  resolverSlug?: (textoNormalizado: string) => Promise<string | undefined>,
): Promise<PlanIA> {
  const n = normalizar(texto)
  if (n.length === 0) return { escenario: 'no-entendido', llamadas: [] }

  const slug = await resolverSlugDelCatalogo(n, resolverSlug)
  return (
    planDiagrama(texto, n) ??
    planComparacion(n, slug) ??
    planDiagnostico(n, slug) ??
    planAsistenteTecnico(n, slug) ??
    planExplicacion(n, slug) ??
    planFichaExplicita(n, slug) ??
    planSucesor(n, slug) ??
    planBusquedaLibre(n, slug)
  )
}

/** Slug del catálogo: primero el adaptador real, después los alias canónicos. */
async function resolverSlugDelCatalogo(
  normalizado: string,
  resolverSlug?: (textoNormalizado: string) => Promise<string | undefined>,
): Promise<string | undefined> {
  const resuelto = resolverSlug !== undefined ? await resolverSlug(normalizado) : undefined
  return resuelto ?? detectarSlug(normalizado)
}
