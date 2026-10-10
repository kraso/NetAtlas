import type { LlamadaHerramienta } from './assistant.js'
import type { PlanIA } from './comprender-contratos.js'
import { contiene, construirBusquedaDsl, palabrasComparar, palabrasDiagrama, palabrasDiagnostico, palabrasExplicacion, palabrasSucesor } from './comprender-dsl.js'
import { textoSinRuido } from './comprender-expresiones.js'

/**
 * Un plan por escenario de §21.2, en la prioridad del orquestador:
 * diagramas > comparación > diagnóstico > asistente > explicación > ficha
 * explícita > búsqueda libre. Cada constructor devuelve `undefined` cuando
 * la frase no encaja en su escenario.
 */

/** Escenario 2 — generación de diagramas: "topología con dos switches…". */
export function planDiagrama(texto: string, normalizado: string): PlanIA | undefined {
  if (!contiene(normalizado, palabrasDiagrama)) return undefined
  return {
    escenario: 'generacion-diagramas',
    llamadas: [{ herramienta: 'build_topology', argumentos: { name: `Topología IA: ${texto.trim().slice(0, 60)}` } }],
    textoBusqueda: textoSinRuido(normalizado),
  }
}

/** Escenario 5 — comparación inteligente / alternativa moderna. */
export function planComparacion(normalizado: string, slug: string | undefined): PlanIA | undefined {
  if (!contiene(normalizado, palabrasComparar)) return undefined
  if (slug === undefined) {
    return {
      escenario: 'comparacion',
      llamadas: [{ herramienta: 'search_catalog', argumentos: { dsl: construirBusquedaDsl(normalizado), limit: 5 } }],
      textoBusqueda: normalizado,
    }
  }
  return {
    escenario: 'comparacion',
    llamadas: [
      { herramienta: 'successors', argumentos: { slug } },
      { herramienta: 'find_compatible', argumentos: { device: slug } },
    ],
    slugPrincipal: slug,
  }
}

/** Escenario 4 — diagnóstico / conexión práctica (presupuesto, PoE, conversores). */
export function planDiagnostico(normalizado: string, slug: string | undefined): PlanIA | undefined {
  if (!contiene(normalizado, palabrasDiagnostico)) return undefined
  return {
    escenario: 'diagnostico',
    llamadas: [{ herramienta: 'search_catalog', argumentos: { dsl: construirBusquedaDsl(normalizado), limit: 5 } }],
    textoBusqueda: normalizado,
    slugPrincipal: slug,
  }
}

/** Escenario 1 — asistente técnico ("necesito conectar", "qué dispositivo"). */
export function planAsistenteTecnico(normalizado: string, slug: string | undefined): PlanIA | undefined {
  const palabras = ['necesito', 'quiero conectar', 'que dispositivo', 'como conecto', 'que necesito', 'para conectar']
  if (!contiene(normalizado, palabras)) return undefined
  const dsl = construirBusquedaDsl(normalizado)
  return {
    escenario: 'asistente-tecnico',
    llamadas: [
      { herramienta: 'search_catalog', argumentos: { dsl: dsl || undefined, limit: 5 } },
      ...(slug !== undefined ? [{ herramienta: 'get_device', argumentos: { slug } }] : []),
    ],
    textoBusqueda: normalizado,
    slugPrincipal: slug,
  }
}

/** Escenario 3 — explicación técnica ("explica", "por qué", "cómo funciona"). */
export function planExplicacion(normalizado: string, slug: string | undefined): PlanIA | undefined {
  if (!contiene(normalizado, palabrasExplicacion)) return undefined
  return {
    escenario: 'explicacion-tecnica',
    llamadas: [
      ...(slug !== undefined ? [{ herramienta: 'get_device', argumentos: { slug } }] : []),
      { herramienta: 'search_catalog', argumentos: { dsl: construirBusquedaDsl(normalizado), limit: 3 } },
    ],
    textoBusqueda: normalizado,
    slugPrincipal: slug,
  }
}

/**
 * Ficha explícita (sub-casos de búsqueda con slug): "¿qué es X?",
 * "cuántos puertos tiene X", "capas" y sucesión. Siempre dato real.
 */
export function planFichaExplicita(normalizado: string, slug: string | undefined): PlanIA | undefined {
  if (slug === undefined) return undefined
  const sinPunt = normalizado.replace(/[¿?¡!]/g, '').trim()
  if (/^(que es|cual es|dime|ficha|cuentame|informacion|cuantos puertos|cantos puertos)/.test(sinPunt)) {
    return ficha(normalizado, slug, { herramienta: 'get_device', argumentos: { slug } })
  }
  if (/cuantos? puertos/.test(normalizado)) return ficha(normalizado, slug, { herramienta: 'get_device', argumentos: { slug } })
  if (contiene(normalizado, ['capas'])) return ficha(normalizado, slug, { herramienta: 'what_layers', argumentos: { slug } })
  return undefined
}

/** Sucesión explícita (sub-caso del asistente, prioridad alta con slug). */
export function planSucesor(normalizado: string, slug: string | undefined): PlanIA | undefined {
  if (slug === undefined || !contiene(normalizado, palabrasSucesor)) return undefined
  return { escenario: 'asistente-tecnico', llamadas: [{ herramienta: 'successors', argumentos: { slug } }], slugPrincipal: slug }
}

/** Plan de ficha de un solo dispositivo (sin búsqueda de catálogo). */
function ficha(normalizado: string, slug: string, llamada: LlamadaHerramienta): PlanIA {
  return { escenario: 'busqueda', llamadas: [llamada], textoBusqueda: normalizado, slugPrincipal: slug }
}

/** Búsqueda libre: DSL estructurado si se detecta, si no texto libre. */
export function planBusquedaLibre(normalizado: string, slug: string | undefined): PlanIA {
  const dsl = construirBusquedaDsl(normalizado)
  return {
    escenario: 'busqueda',
    llamadas: [{ herramienta: 'search_catalog', argumentos: { dsl: dsl || undefined, limit: 5 } }],
    textoBusqueda: normalizado,
    slugPrincipal: slug,
  }
}
