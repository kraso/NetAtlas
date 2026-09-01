/**
 * Comprensión de lenguaje natural → plan de herramientas/consulta DSL
 * (sección 21.1[1] — adaptador local determinista; un proveedor LLM cloud
 * puede sustituir esta etapa manteniendo el mismo contrato de plan).
 *
 * Reconoce los cinco escenarios de §21.2 y emite llamadas a las herramientas
 * del catálogo (tools.ts). NUNCA inventa: si no reconoce nada, cae en el
 * escenario 'search_catalog' con el texto libre, o en 'no-entendido'.
 */
import type { LlamadaHerramienta } from './assistant.js'

export type EscenarioIA =
  | 'asistente-tecnico'
  | 'generacion-diagramas'
  | 'explicacion-tecnica'
  | 'diagnostico'
  | 'comparacion'
  | 'busqueda'
  | 'no-entendido'

export interface PlanIA {
  readonly escenario: EscenarioIA
  /** Llamadas de herramienta a ejecutar en orden (0..n). */
  readonly llamadas: readonly LlamadaHerramienta[]
  /** Texto límite para búsqueda cuando no hay DSL estructurado. */
  readonly textoBusqueda?: string | undefined
  /** Slug explícito detectado (dispositivo principal del tema). */
  readonly slugPrincipal?: string | undefined
}

/** Normaliza el texto: minúsculas sin tildes y colapsa espacios. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const NOMBRE_A_SLUG: ReadonlyArray<readonly [string, string]> = [
  ['catalyst 9300', 'cisco-c9300-48p'],
  ['c9300', 'cisco-c9300-48p'],
  ['9300', 'cisco-c9300-48p'],
  ['aruba 6300', 'aruba-6300m-48g'],
  ['6300m', 'aruba-6300m-48g'],
  ['2930f', 'aruba-2930f-48g'],
  ['2930', 'aruba-2930f-48g'],
  ['ccr1036', 'mikrotik-ccr1036'],
  ['ccr', 'mikrotik-ccr1036'],
  ['fortigate 200f', 'fortinet-200f'],
  ['200f', 'fortinet-200f'],
  ['9120', 'cisco-9120axi'],
  ['9120axi', 'cisco-9120axi'],
  ['fortinet', 'fortinet-200f'],
  ['fortigate', 'fortinet-200f'],
  ['mikrotik', 'mikrotik-ccr1036'],
  ['aruba', 'aruba-6300m-48g'],
  ['cisco', 'cisco-c9300-48p'],
]

/** Detecta un slug conocido por nombre comercial (catálogo real del seed/demo). */
export function detectarSlug(textoNormalizado: string): string | undefined {
  for (const [nombre, slug] of NOMBRE_A_SLUG) {
    if (textoNormalizado.includes(nombre)) return slug
  }
  // Slugs de catálogo reales: `cisco-c9300-48p` etc.
  const m = textoNormalizado.match(/(?:[a-z0-9-]+)-[a-z0-9]+(?:-[a-z0-9]+)+/)
  return m?.[0] ?? undefined
}

/** Extrae velocidades "10 Gbps" / "interfaces de 10 G" / "10000 mbps" → Mbps. */
export function extraerVelocidadMbps(textoNormalizado: string): number | undefined {
  const g = textoNormalizado.match(/(\d+(?:[.,]\d+)?)\s*gbps\b/)
  if (g) return Math.round(parseFloat(g[1]!.replace(',', '.')) * 1000)
  const gs = textoNormalizado.match(/(\d+(?:[.,]\d+)?)\s*g\b/)
  if (gs) return Math.round(parseFloat(gs[1]!.replace(',', '.')) * 1000)
  const m = textoNormalizado.match(/(\d+(?:[.,]\d+)?)\s*mbps\b/)
  if (m) return Math.round(parseFloat(m[1]!.replace(',', '.')))
  return undefined
}

const PALABRAS_COMPARAR = ['compar', 'vs ', 'versus', 'frente a', 'mejor que', 'alternativa moderna', 'en lugar de']
const PALABRAS_DIAGRAMA = ['topologia', 'diagrama', 'red con', 'disenos', 'disena', 'dibuja', 'grafo con']
const PALABRAS_EXPLICACION = ['explica', 'explicacion', 'que significa', 'diferencia entre', 'por que', 'como funciona', 'para que sirve']
const PALABRAS_DIAGNOSTICO = ['convierte', 'convertir', 'presupuesto', 'poe', 'media converter', 'transceptor']
const PALABRAS_SUCESOR = ['sucesor', 'reemplaza', 'sustituye', 'evolucion', 'nuevo modelo', 'alternativa']

function contiene(texto: string, palabras: readonly string[]): boolean {
  return palabras.some((p) => texto.includes(p))
}

function construirBusquedaDsl(textoNormalizado: string): string {
  // "switches capa 3" → cat:sw capa:3 ; "interfaces de 10 gbps" → velocidad:10000
  const tokens: string[] = []
  if (contiene(textoNormalizado, ['switch', 'conmutador', 'capas l2', 'capas 2'])) {
    tokens.push('cat:sw')
    if (contiene(textoNormalizado, ['capa 3', 'capas 3', 'layer 3', 'multilayer', 'l3'])) tokens.push('capa:3')
    else if (contiene(textoNormalizado, ['capa 2', 'capas 2', 'l2'])) tokens.push('capa:2')
  } else if (contiene(textoNormalizado, ['router', 'enrutador'])) {
    tokens.push('cat:rtr')
  } else if (contiene(textoNormalizado, ['firewall', 'seguridad', 'fortigate'])) {
    tokens.push('cat:sec')
  } else if (contiene(textoNormalizado, ['wifi', 'inalambric', 'ap '])) {
    tokens.push('cat:wls')
  }
  if (contiene(textoNormalizado, ['fibra', 'smf', 'os2'])) tokens.push('medio:smf-os2')
  else if (contiene(textoNormalizado, ['multimodo', 'mmf', 'om3', 'om4'])) tokens.push('medio:mmf-om3')
  else if (contiene(textoNormalizado, ['cobre', 'utp', 'rj45', 'cat6'])) tokens.push('medio:utp-cat6a')
  if (contiene(textoNormalizado, ['poe', 'power over ethernet'])) tokens.push('poe:*')
  if (contiene(textoNormalizado, ['ospf'])) tokens.push('+protocolo:ospf')
  if (contiene(textoNormalizado, ['bgp'])) tokens.push('+protocolo:bgp')
  if (contiene(textoNormalizado, ['vxlan'])) tokens.push('+protocolo:vxlan')
  const velocidad = extraerVelocidadMbps(textoNormalizado)
  if (velocidad !== undefined) tokens.push(`velocidad:${velocidad}`)
  return tokens.join(' ')
}

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
  if (n.length === 0) {
    return { escenario: 'no-entendido', llamadas: [] }
  }

  let slug: string | undefined
  if (resolverSlug !== undefined) {
    slug = await resolverSlug(n)
  }
  // Fallback a alias canónicos del demo (solo si el adaptador no resolvió).
  if (slug === undefined) {
    slug = detectarSlug(n)
  }

  // Escenario 2 — generación de diagramas: ~ "topología con dos switches, un router y cuatro hosts"
  if (contiene(n, PALABRAS_DIAGRAMA)) {
    return {
      escenario: 'generacion-diagramas',
      llamadas: [{ herramienta: 'build_topology', argumentos: { name: `Topología IA: ${texto.trim().slice(0, 60)}` } }],
      textoBusqueda: textoSinRuido(n),
    }
  }

  // Escenario 5 — comparación inteligente / alternativa moderna
  if (contiene(n, PALABRAS_COMPARAR)) {
    if (slug !== undefined) {
      return {
        escenario: 'comparacion',
        llamadas: [
          { herramienta: 'successors', argumentos: { slug: slugPrincipalPara(n, slug) } },
          { herramienta: 'find_compatible', argumentos: { device: slugPrincipalPara(n, slug) } },
        ],
        slugPrincipal: slugPrincipalPara(n, slug),
      }
    }
    return {
      escenario: 'comparacion',
      llamadas: [{ herramienta: 'search_catalog', argumentos: { dsl: construirBusquedaDsl(n), limit: 5 } }],
      textoBusqueda: n,
    }
  }

  // Escenario 4 — diagnóstico / conexión práctica
  if (contiene(n, PALABRAS_DIAGNOSTICO)) {
    return {
      escenario: 'diagnostico',
      llamadas: [{ herramienta: 'search_catalog', argumentos: { dsl: construirBusquedaDsl(n), limit: 5 } }],
      textoBusqueda: n,
      slugPrincipal: slug,
    }
  }

  // Escenario 1 — asistente técnico (necesito conectar / qué dispositivo)
  if (contiene(n, ['necesito', 'quiero conectar', 'que dispositivo', 'como conecto', 'que necesito', 'para conectar'])) {
    const dsl = construirBusquedaDsl(n)
    return {
      escenario: 'asistente-tecnico',
      llamadas: [
        { herramienta: 'search_catalog', argumentos: { dsl: dsl || undefined, limit: 5 } },
        ...(slug !== undefined ? [{ herramienta: 'get_device', argumentos: { slug } }] : []),
      ],
      textoBusqueda: n,
      slugPrincipal: slug,
    }
  }

  // Escenario 3 — explicación técnica
  if (contiene(n, PALABRAS_EXPLICACION)) {
    return {
      escenario: 'explicacion-tecnica',
      llamadas: [
        ...(slug !== undefined ? [{ herramienta: 'get_device', argumentos: { slug } }] : []),
        { herramienta: 'search_catalog', argumentos: { dsl: construirBusquedaDsl(n), limit: 3 } },
      ],
      textoBusqueda: n,
      slugPrincipal: slug,
    }
  }

  // Ficha explícita: "¿qué es X?" / "dime algo de X" → get_device (no explicación)
  const sinPunt = n.replace(/[¿?¡!]/g, '').trim()
  if (slug !== undefined && /^(que es|cual es|dime|ficha|cuentame|informacion|cuantos puertos|cantos puertos)/.test(sinPunt)) {
    return {
      escenario: 'busqueda',
      llamadas: [{ herramienta: 'get_device', argumentos: { slug } }],
      textoBusqueda: n,
      slugPrincipal: slug,
    }
  }

  // "cuántos puertos tiene X" — get_device (dato real del inventario)
  if (slug !== undefined && /cuantos? puertos/.test(n)) {
    return {
      escenario: 'busqueda',
      llamadas: [{ herramienta: 'get_device', argumentos: { slug } }],
      textoBusqueda: n,
      slugPrincipal: slug,
    }
  }

  // Capas OSI explícitas → what_layers
  if (slug !== undefined && contiene(n, ['capas'])) {
    return {
      escenario: 'busqueda',
      llamadas: [{ herramienta: 'what_layers', argumentos: { slug } }],
      textoBusqueda: n,
      slugPrincipal: slug,
    }
  }

  // Sucesión explícita (es un sub-caso del asistente, prioridad alta cuando hay slug)
  if (slug !== undefined && contiene(n, PALABRAS_SUCESOR)) {
    return {
      escenario: 'asistente-tecnico',
      llamadas: [{ herramienta: 'successors', argumentos: { slug } }],
      slugPrincipal: slug,
    }
  }

  // Búsqueda libre: DSL estructurado si se detecta, si no texto libre
  const dsl = construirBusquedaDsl(n)
  return {
    escenario: 'busqueda',
    llamadas: [{ herramienta: 'search_catalog', argumentos: { dsl: dsl || undefined, limit: 5 } }],
    textoBusqueda: n,
    slugPrincipal: slug,
  }
}

/** Slug principal: si el texto menciona un nombre comercial que resuelve a slug. */
function slugPrincipalPara(textoNormalizado: string, slugDetectado: string): string {
  // detectarSlug ya prefirió el comercial más específico; se devuelve tal cual.
  return slugDetectado
}

/** Quita ruido de la frase de diagrama para pasárselo al generador de topología. */
export function textoSinRuido(textoNormalizado: string): string {
  return textoNormalizado.replace(/^(topologia|diagrama|grafo|red)\s+(de\s+|con\s+)?/, '').trim()
}