/**
 * Generación de topologías por lenguaje natural (sección 21.2 escenario 2,
 * NET-HW-061). Traduce "topología con dos switches, un router y cuatro hosts"
 * a una especificación JSON validada, resuelve entidades reales del catálogo
 * y construye la Topology con sus invariantes. Solo categorías/dispositivos
 * existentes; enlaces validados por compatibilidad de interfaces (§13.3).
 */
import { Topology } from '../topologies/topology.js'

export interface RolRequerido {
  readonly rol: string
  readonly cantidad: number
}

export interface TopologiaSpec {
  readonly name: string
  /** Roles detectados (switch/router/host/ap/firewall) con su cantidad. */
  readonly roles: readonly RolRequerido[]
}

export const ROLES_CONOCIDOS: Readonly<Record<string, string>> = {
  switch: 'switch',
  switches: 'switch',
  conmutador: 'switch',
  conmutadores: 'switch',
  router: 'router',
  routers: 'router',
  enrutador: 'router',
  host: 'host',
  hosts: 'host',
  cliente: 'host',
  clientes: 'host',
  equipo: 'host',
  equipos: 'host',
  ap: 'ap',
  aps: 'ap',
  'punto de acceso': 'ap',
  firewall: 'firewall',
  cortafuegos: 'firewall',
  servidor: 'servidor',
  servidores: 'servidor',
}

const NUMEROS: Readonly<Record<string, number>> = {
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

/** Extrae los roles de una frase de topología: "dos switches, un router y cuatro hosts". */
export function extraerRoles(textoNormalizado: string): readonly RolRequerido[] {
  const roles = new Map<string, number>()
  // Patrón: [número|palabra][espacios]rol(,|y|espacio)
  const re = /(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(switch|switches|conmutador(?:es)?|router(?:s)?|enrutador(?:es)?|hosts?|clientes?|equipos?|ap(?:s)?|punto de acceso|firewall(?:s)?|cortafuegos|cortafuegos|servidores?)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(textoNormalizado)) !== null) {
    const cantidad = NUMEROS[m[1]!] ?? parseInt(m[1]!, 10)
    const rol = ROLES_CONOCIDOS[m[2]!] ?? m[2]!
    roles.set(rol, (roles.get(rol) ?? 0) + Math.max(1, cantidad))
  }
  // Fallback: "switch" sin número → 1
  if (roles.size === 0 && /\bswitch(es|)\b/.test(textoNormalizado)) roles.set('switch', 1)
  return [...roles.entries()].map(([rol, cantidad]) => ({ rol, cantidad }))
}

/** Parsea la especificación desde texto libre (modo "generación por lenguaje"). */
export function parsearSpec(texto: string, nameSugerido: string): TopologiaSpec {
  const n = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const roles = extraerRoles(n)
  return { name: nameSugerido, roles }
}

/** Valida que una especificación JSON tenga la forma esperada (esquema §21.2). */
export function validarSpecJSON(valor: unknown): TopologiaSpec | undefined {
  if (typeof valor !== 'object' || valor === null) return undefined
  const v = valor as Record<string, unknown>
  if (typeof v.name !== 'string' || !Array.isArray(v.roles)) return undefined
  const roles: RolRequerido[] = []
  for (const r of v.roles) {
    if (typeof r !== 'object' || r === null) return undefined
    const rr = r as Record<string, unknown>
    if (typeof rr.rol !== 'string' || typeof rr.cantidad !== 'number' || rr.cantidad < 1) return undefined
    roles.push({ rol: rr.rol, cantidad: Math.floor(rr.cantidad) })
  }
  if (roles.length === 0) return undefined
  return { name: v.name, roles }
}

export interface GeneradorContexto {
  /**
   * Resuelve la instancia `instancia` (0-based) de un rol a un dispositivo
   * real. El adaptador devuelve candidatos distintos por instancia cuando el
   * catálogo lo permite (p. ej. dos switches = dos modelos de la familia).
   */
  resolverRol(rol: string, instancia: number): Promise<{ entitySlug: string; entityName: string } | undefined>
  /** Velocidades de interfaz del dispositivo (para validar enlaces). */
  velocidadesDe(slug: string): Promise<readonly number[]>
}

export interface TopologiaGenerada {
  readonly ok: boolean
  readonly topologia?: Topology
  readonly razon?: string
  /** Roles que no pudieron resolverse a dispositivos reales. */
  readonly sinResolver?: readonly string[]
}

/**
 * Construye y valida la topología desde la especificación.
 * Enlaces: cada rol resuelto a dispositivo real; el adaptador conecta en
 * estrella al primer dispositivo (núcleo). Sólo se persisten entidades reales.
 */
export async function generarTopologia(
  spec: TopologiaSpec,
  ctx: GeneradorContexto,
): Promise<TopologiaGenerada> {
  const resueltos: { rol: string; entitySlug: string; entityName: string }[] = []
  const sinResolver: string[] = []
  const usados = new Set<string>()
  for (const rol of spec.roles) {
    for (let i = 0; i < rol.cantidad; i++) {
      const r = await ctx.resolverRol(rol.rol, i)
      if (!r) {
        sinResolver.push(rol.rol)
        continue
      }
      // Un mismo dispositivo real no puede aparecer dos veces (id de nodo único).
      if (usados.has(r.entitySlug)) continue
      usados.add(r.entitySlug)
      resueltos.push({ rol: rol.rol, entitySlug: r.entitySlug, entityName: r.entityName })
    }
  }

  if (resueltos.length === 0) {
    return {
      ok: false,
      razon: 'No se pudo resolver ningún rol a un dispositivo real del catálogo.',
      sinResolver: [...new Set(sinResolver)],
    }
  }

  const nodes = resueltos.map((r, i) => ({
    entityType: 'device' as const,
    entitySlug: r.entitySlug,
    x: ((i % 8) * 120) + 40,
    y: Math.floor(i / 8) * 140 + 40,
    layerHint: capaDeRol(r.rol),
  }))

  // Enlaces en estrella hacia el primer dispositivo (núcleo), validados por interfaz común.
  const edges: { from: string; to: string; label?: string }[] = []
  const nucleo = nodes[0]!
  const velocidadesNucleo = await ctx.velocidadesDe(nucleo.entitySlug)
  for (let i = 1; i < nodes.length; i++) {
    const v = await ctx.velocidadesDe(nodes[i]!.entitySlug)
    const comunes = v.filter((x) => velocidadesNucleo.includes(x))
    if (comunes.length === 0) {
      return {
        ok: false,
        razon: `Sin interfaz común entre ${nucleo.entitySlug} y ${nodes[i]!.entitySlug}.`,
        sinResolver: [...new Set(sinResolver)],
      }
    }
    edges.push({
      from: `device:${nucleo.entitySlug}`,
      to: `device:${nodes[i]!.entitySlug}`,
      label: `${comunes[0]!} Mbps`,
    })
  }

  const slug = `ia-${Date.now().toString(36)}`
  try {
    const topologia = Topology.create({
      slug,
      name: spec.name,
      kind: 'user',
      nodes,
      edges,
      metadata: { generadaPor: 'asistente-ia', roles: spec.roles },
    })
    return { ok: true, topologia, sinResolver: [...new Set(sinResolver)] }
  } catch (err) {
    return { ok: false, razon: err instanceof Error ? err.message : 'Topología inválida.' }
  }
}

/** Indica la capa OSI aproximada de un rol (solo hint de layout). */
export function capaDeRol(rol: string): number {
  switch (rol) {
    case 'firewall': return 4
    case 'router': return 3
    case 'switch': return 2
    case 'ap': return 1
    case 'host': return 7
    case 'servidor': return 7
    default: return 3
  }
}