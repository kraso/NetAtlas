import type { SqliteDriver } from '../driver.js'
import { SqliteCatalogRepository, SqliteDeviceRepository, SqliteGraphRepository, SqliteSourcingRepository, SqliteAttributesRepository } from './repositories-barrel.js'
import { valorLegible } from './sqlite-assistant-helpers.js'

/**
 * Herramientas de dispositivo del asistente IA (§21): getDevice, whatLayers,
 * successors y findCompatible como funciones libres sobre el driver.
 */

/** Ficha completa legible de un dispositivo (puertos + assertions + atributos). */
export async function datosDeDispositivo(db: SqliteDriver, slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  const repoDevices = new SqliteDeviceRepository(db)
  const repoSourcing = new SqliteSourcingRepository(db)
  const repoAttrs = new SqliteAttributesRepository(db)
  const device = await repoDevices.findBySlug(slug)
  if (!device) return undefined

  const assertions = await repoSourcing.assertionsForDevice(slug)
  const attrs = await repoAttrs.attributeValuesForDevice(slug)
  const categoria = await new SqliteCatalogRepository(db).categoryByCode(device.categoryCode)

  return {
    slug: device.slug.value,
    nombre: device.name,
    fabricante: device.manufacturerSlug,
    categoria: categoria?.nameEs ?? device.categoryCode,
    lanza: device.releasedOn ?? undefined,
    puertos: device.ports.map((p) => ({ label: p.label, cantidad: p.quantity, speeds: p.speedsMbps })),
    assertions: assertions.map((a) => ({
      predicado: a.predicate,
      valor: valorLegible(a.predicate, a.valueJson),
      fuenteSlug: a.source.slug,
      fuenteTitulo: a.source.title,
    })),
    atributos: attrs.map((a) => ({ predicado: a.key, valor: a.display, unidad: a.unit })),
  }
}

/** Perfil OSI de un dispositivo (whatLayers). */
export async function capasDeDispositivo(db: SqliteDriver, slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  const device = await new SqliteDeviceRepository(db).findBySlug(slug)
  if (!device || !device.osiProfile) return undefined
  return {
    slug,
    nombre: device.name,
    termina: device.osiProfile.profile.terminate,
    transparente: device.osiProfile.profile.transparent,
    primaria: device.osiProfile.profile.primary,
  }
}

/** Sucesores/predecesores/reemplazos/similares de un dispositivo (successors). */
export async function sucesoresDe(db: SqliteDriver, slug: string): Promise<readonly { relacion: string; slug: string; nombre: string }[]> {
  const repoDevices = new SqliteDeviceRepository(db)
  const aristas = await new SqliteGraphRepository(db).edgesOf({ type: 'device', slug })
  const out: { relacion: string; slug: string; nombre: string }[] = []
  for (const r of aristas) {
    if (r.predicate !== 'succeeds' && r.predicate !== 'precedes' && r.predicate !== 'replaced-by' && r.predicate !== 'similar-to') continue
    const esSubject = r.subject.type === 'device' && r.subject.slug === slug
    const peer = esSubject ? r.object : r.subject
    if (peer.type !== 'device') continue
    const d = await repoDevices.findBySlug(peer.slug)
    if (!d) continue
    out.push({ relacion: r.predicate, slug: peer.slug, nombre: d.name })
  }
  return out
}

/** Dispositivos compatibles/similares por aristas curadas (findCompatible). */
export async function compatiblesDe(db: SqliteDriver, device: string, constraint: string | undefined): Promise<Readonly<Record<string, unknown>>> {
  const repoDevices = new SqliteDeviceRepository(db)
  void constraint
  const aristas = await new SqliteGraphRepository(db).edgesOf({ type: 'device', slug: device })
  const compatibles: { slug: string; nombre: string; via: string }[] = []
  for (const r of aristas) {
    const esSubject = r.subject.type === 'device' && r.subject.slug === device
    const peer = esSubject ? r.object : r.subject
    if (peer.type !== 'device') continue
    if (r.predicate !== 'compatible-with' && r.predicate !== 'similar-to') continue
    const d = await repoDevices.findBySlug(peer.slug)
    if (!d) continue
    compatibles.push({ slug: peer.slug, nombre: d.name, via: r.predicate })
  }
  return { dispositivo: device, compatibles }
}
