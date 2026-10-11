import { Topology } from '../topologies/topology.js'
import { capaDeRol } from './topologia-capas.js'
import type { TopologiaSpec } from './topologia-spec.js'

/**
 * Generación de topologías por lenguaje natural (sección 21.2 escenario 2,
 * NET-HW-061). Traduce "topología con dos switches, un router y cuatro hosts"
 * a una especificación validada (`topologia-spec.ts`), resuelve entidades
 * reales del catálogo y construye la Topology con sus invariantes. Solo
 * categorías/dispositivos existentes; enlaces validados por compatibilidad
 * de interfaces (§13.3). La capa por rol vive en `topologia-capas.ts`.
 */

export { ROLES_CONOCIDOS, extraerRoles, parsearSpec, validarSpecJSON } from './topologia-spec.js'
export type { RolRequerido, TopologiaSpec } from './topologia-spec.js'
export { capaDeRol } from './topologia-capas.js'

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
  const resolucion = await resolverRoles(spec, ctx)
  if (resolucion.resueltos.length === 0) {
    return {
      ok: false,
      razon: 'No se pudo resolver ningún rol a un dispositivo real del catálogo.',
      sinResolver: resolucion.sinResolver,
    }
  }
  const enlaces = await enlazarEnEstrella(resolucion.resueltos, ctx, resolucion.sinResolver)
  if ('ok' in enlaces) return enlaces
  return construirTopologia(spec, resolucion.resueltos, enlaces, resolucion.sinResolver)
}

/** Resuelve cada rol a un dispositivo real, sin repetir entidades. */
async function resolverRoles(
  spec: TopologiaSpec,
  ctx: GeneradorContexto,
): Promise<{ resueltos: Resuelto[]; sinResolver: readonly string[] }> {
  const resueltos: Resuelto[] = []
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
  return { resueltos, sinResolver: [...new Set(sinResolver)] }
}

interface Resuelto {
  readonly rol: string
  readonly entitySlug: string
  readonly entityName: string
}

/**
 * Enlaces en estrella hacia el primer dispositivo (núcleo), validados por
 * interfaz común. Devuelve la lista de enlaces o el fallo de validación.
 */
async function enlazarEnEstrella(
  resueltos: readonly Resuelto[],
  ctx: GeneradorContexto,
  sinResolver: readonly string[],
): Promise<readonly { from: string; to: string; label?: string }[] | TopologiaGenerada> {
  const edges: { from: string; to: string; label?: string }[] = []
  const nucleo = resueltos[0]!
  const velocidadesNucleo = await ctx.velocidadesDe(nucleo.entitySlug)
  for (const otro of resueltos.slice(1)) {
    const comunes = (await ctx.velocidadesDe(otro.entitySlug)).filter((v) => velocidadesNucleo.includes(v))
    if (comunes.length === 0) {
      return { ok: false, razon: `Sin interfaz común entre ${nucleo.entitySlug} y ${otro.entitySlug}.`, sinResolver }
    }
    edges.push({ from: `device:${nucleo.entitySlug}`, to: `device:${otro.entitySlug}`, label: `${comunes[0]!} Mbps` })
  }
  return edges
}

/** Topología final: posiciones en rejilla, capa por rol y metadatos de origen. */
function construirTopologia(
  spec: TopologiaSpec,
  resueltos: readonly Resuelto[],
  edges: readonly { from: string; to: string; label?: string }[],
  sinResolver: readonly string[],
): TopologiaGenerada {
  const nodes = resueltos.map((r, i) => ({
    entityType: 'device' as const,
    entitySlug: r.entitySlug,
    x: (i % 8) * 120 + 40,
    y: Math.floor(i / 8) * 140 + 40,
    layerHint: capaDeRol(r.rol),
  }))
  try {
    const topologia = Topology.create({
      slug: `ia-${Date.now().toString(36)}`,
      name: spec.name,
      kind: 'user',
      nodes,
      edges,
      metadata: { generadaPor: 'asistente-ia', roles: spec.roles },
    })
    return { ok: true, topologia, sinResolver }
  } catch (err) {
    return { ok: false, razon: err instanceof Error ? err.message : 'Topología inválida.' }
  }
}
