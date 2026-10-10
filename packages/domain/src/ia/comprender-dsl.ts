import { extraerVelocidadMbps } from './comprender-expresiones.js'

/**
 * Traducción de lenguaje natural a DSL de búsqueda del catálogo (§21.1[1]):
 * "switches capa 3" → `cat:sw capa:3`, "interfaces de 10 gbps" →
 * `velocidad:10000`. Solo tokens con evidencia en el texto; nada se inventa.
 */

const palabrasComparar = ['compar', 'vs ', 'versus', 'frente a', 'mejor que', 'alternativa moderna', 'en lugar de']
const palabrasDiagrama = ['topologia', 'diagrama', 'red con', 'disenos', 'disena', 'dibuja', 'grafo con']
const palabrasExplicacion = ['explica', 'explicacion', 'que significa', 'diferencia entre', 'por que', 'como funciona', 'para que sirve']
const palabrasDiagnostico = ['convierte', 'convertir', 'presupuesto', 'poe', 'media converter', 'transceptor']
const palabrasSucesor = ['sucesor', 'reemplaza', 'sustituye', 'evolucion', 'nuevo modelo', 'alternativa']

export { palabrasComparar, palabrasDiagrama, palabrasExplicacion, palabrasDiagnostico, palabrasSucesor }

/** ¿El texto contiene alguna de las palabras de escena? */
export function contiene(texto: string, palabras: readonly string[]): boolean {
  return palabras.some((p) => texto.includes(p))
}

/** Tokens de categoría/medio/protocolo/velocidad detectados en la frase. */
export function construirBusquedaDsl(textoNormalizado: string): string {
  const tokens = [...tokensCategoria(textoNormalizado), ...tokensMedio(textoNormalizado), ...tokensProtocolo(textoNormalizado)]
  const velocidad = extraerVelocidadMbps(textoNormalizado)
  if (velocidad !== undefined) tokens.push(`velocidad:${velocidad}`)
  return tokens.join(' ')
}

/** Categoría de catálogo (switch/router/firewall/wifi) y capa OSI si se nombra. */
function tokensCategoria(texto: string): string[] {
  if (contiene(texto, ['switch', 'conmutador', 'capas l2', 'capas 2'])) {
    if (contiene(texto, ['capa 3', 'capas 3', 'layer 3', 'multilayer', 'l3'])) return ['cat:sw', 'capa:3']
    if (contiene(texto, ['capa 2', 'capas 2', 'l2'])) return ['cat:sw', 'capa:2']
    return ['cat:sw']
  }
  if (contiene(texto, ['router', 'enrutador'])) return ['cat:rtr']
  if (contiene(texto, ['firewall', 'seguridad', 'fortigate'])) return ['cat:sec']
  if (contiene(texto, ['wifi', 'inalambric', 'ap '])) return ['cat:wls']
  return []
}

/** Medio físico mencionado (fibra monomodo, multimodo o cobre). */
function tokensMedio(texto: string): string[] {
  if (contiene(texto, ['fibra', 'smf', 'os2'])) return ['medio:smf-os2']
  if (contiene(texto, ['multimodo', 'mmf', 'om3', 'om4'])) return ['medio:mmf-om3']
  if (contiene(texto, ['cobre', 'utp', 'rj45', 'cat6'])) return ['medio:utp-cat6a']
  return []
}

/** PoE y protocolos mencionados explícitamente. */
function tokensProtocolo(texto: string): string[] {
  const tokens: string[] = []
  if (contiene(texto, ['poe', 'power over ethernet'])) tokens.push('poe:*')
  if (contiene(texto, ['ospf'])) tokens.push('+protocolo:ospf')
  if (contiene(texto, ['bgp'])) tokens.push('+protocolo:bgp')
  if (contiene(texto, ['vxlan'])) tokens.push('+protocolo:vxlan')
  return tokens
}
