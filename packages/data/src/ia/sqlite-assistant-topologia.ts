import type { SqliteDriver } from '../driver.js'
import { SqliteDeviceRepository, SqliteTopologyRepository } from './repositories-barrel.js'
import { generarTopologia, parsearSpec } from '@netatlas/domain'
import type { TopologiaSpec } from '@netatlas/domain'
import { ROL_A_CATEGORIA, validarSpecFromRaw } from './sqlite-assistant-helpers.js'

/**
 * `buildTopology` del asistente (NET-HW-061): valida la spec (raw o texto),
 * genera la topología con invariantes del agregado y la persiste vía
 * repositorio — nunca fuera del dominio.
 */

/** Resuelve un rol de topología a un dispositivo real de su categoría. */
export async function resolverRol(db: SqliteDriver, rol: string, instancia: number): Promise<{ entitySlug: string; entityName: string } | undefined> {
  const categoria = ROL_A_CATEGORIA[rol]
  if (!categoria) return undefined
  const page = await new SqliteDeviceRepository(db).listByCategory(categoria, { limit: 20 })
  const candidato = page.items[instancia % Math.max(1, page.items.length)]
  if (!candidato) return undefined
  return { entitySlug: candidato.slug.value, entityName: candidato.name }
}

/** Velocidades distintas (Mbps) de los puertos de un dispositivo. */
export async function velocidadesDe(db: SqliteDriver, slug: string): Promise<readonly number[]> {
  const device = await new SqliteDeviceRepository(db).findBySlug(slug)
  if (!device) return []
  return [...new Set(device.ports.flatMap((p) => p.speedsMbps))]
}

export async function construirTopologia(db: SqliteDriver, spec: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
  const parsed: TopologiaSpec | undefined =
    validarSpecFromRaw(spec) ??
    (typeof spec.descripcion === 'string' ? parsearSpec(spec.descripcion, String(spec.name ?? 'Topología generada por IA')) : undefined)
  if (!parsed) {
    return { error: 'Especificación de topología inválida. Ejemplo: {name, roles:[{rol:"switch",cantidad:2}]}' }
  }
  const repoTopo = new SqliteTopologyRepository(db)
  const resultado = await generarTopologia(parsed, {
    resolverRol: async (rol, instancia) => resolverRol(db, rol, instancia),
    velocidadesDe: async (slug) => velocidadesDe(db, slug),
  })
  if (!resultado.ok || !resultado.topologia) {
    return { error: resultado.razon ?? 'No se pudo generar la topología.', sinResolver: resultado.sinResolver ?? [] }
  }
  await repoTopo.upsert(resultado.topologia)
  return {
    slug: resultado.topologia.slug.value,
    nombre: resultado.topologia.name,
    nodos: resultado.topologia.nodes.length,
    enlaces: resultado.topologia.edges.length,
    sinResolver: resultado.sinResolver ?? [],
    rol: resultado.topologia.metadata.roles,
  }
}
