import type { CatalogDao } from '@netatlas/data'
import { findPredicate } from '@netatlas/domain'
import type { SeedDevice } from './lint-tipos.js'
import type { Seed } from './build-tipos.js'

/**
 * Siembra de dispositivos del dataset:build (NET-HW-048).
 *
 * Cada concern está en su propia función para mantener este módulo por debajo
 * del límite de 200 líneas (§Convenciones).
 */

export interface ConteosSiembra {
  readonly assertionCount: number
  readonly relationshipCount: number
}

/** Siembra un dispositivo con su metadata básica y devuelve su id interno. */
function upsertDispositivo(dao: CatalogDao, dev: SeedDevice): number | undefined {
  dao.upsertDevice({
    slug: dev.slug,
    name: dev.name,
    manufacturerSlug: dev.manufacturerSlug ?? 'tplink',
    categoryCode: dev.categoryCode,
    lifecycleStatus: dev.lifecycleStatus,
    osiProfileJson: dev.osiProfile ? JSON.stringify(dev.osiProfile) : undefined,
    summary: dev.summary,
  })
  return dao.deviceId(dev.slug)
}

/** Siembra las imágenes de un dispositivo. */
function seedImagenes(dao: CatalogDao, dev: SeedDevice): void {
  for (const imagen of dev.images ?? []) {
    dao.addImage({
      deviceSlug: dev.slug,
      kind: imagen.kind,
      caption: imagen.caption,
      localPath: imagen.localPath,
      url: imagen.url,
      sourceSlug: imagen.sourceSlug,
    })
  }
}

/** Siembra los datasheets de un dispositivo. */
function seedDatasheets(dao: CatalogDao, dev: SeedDevice): void {
  for (const ficha of dev.datasheets ?? []) {
    dao.addDatasheet({
      deviceSlug: dev.slug,
      title: ficha.title,
      language: ficha.language,
      url: ficha.url,
      localPath: ficha.localPath,
      sourceSlug: ficha.sourceSlug,
    })
  }
}

/** Siembra los puertos de un dispositivo. */
function seedPuertos(dao: CatalogDao, dev: SeedDevice): void {
  for (const port of dev.ports ?? []) {
    dao.addPort({
      deviceSlug: dev.slug,
      interfaceCode: port.interfaceCode,
      label: port.label,
      quantity: port.quantity,
      speedsMbps: port.speedsMbps,
      poeStandard: port.poeStandard,
      role: port.role,
    })
  }
}

/** Siembra las assertions de un dispositivo y las aristas `supports-protocol` derivadas. */
function seedAssertions(
  dao: CatalogDao,
  dev: SeedDevice,
  deviceId: number,
): { assertionCount: number; relationshipCount: number } {
  let assertionCount = 0
  let relationshipCount = 0
  for (const assertion of dev.assertions ?? []) {
    const assertionId = dao.addAssertion({
      subjectType: 'device',
      subjectId: deviceId,
      predicate: assertion.predicate,
      valueJson: JSON.stringify(assertion.value),
      sourceSlug: assertion.sourceSlug,
      confidence: assertion.confidence ?? 'derived',
      verifiedOn: '2025-02-10',
      author: 'curator-seed',
      reviewedBy: 'reviewer-seed',
    })
    assertionCount++
    if (assertion.predicate === 'supports-protocol' && typeof assertion.value === 'string') {
      dao.addRelationship({
        subjectType: 'device',
        subjectId: deviceId,
        predicate: 'supports-protocol',
        objectType: 'protocol',
        objectId: dao.protocolId(assertion.value),
        assertionId,
      })
      relationshipCount++
    }
  }
  return { assertionCount, relationshipCount }
}

/**
 * Siembra dispositivos, imágenes, datasheets, puertos y assertions.
 *
 * El objeto puede declararse DESPUÉS que su sujeto en devices.json; en una
 * sola pasada esas referencias futuras se perdían en silencio (p. ej.
 * 2930F→2920). La segunda pasada (`seedAristasExplicitas`) resuelve esto.
 */
export function seedDispositivos(dao: CatalogDao, seed: Seed): ConteosSiembra {
  let assertionCount = 0
  let relationshipCount = 0
  for (const dev of seed.devices) {
    const deviceId = upsertDispositivo(dao, dev)
    if (deviceId === undefined) {
      throw new Error(`dataset:build — el dispositivo "${dev.slug}" no obtuvo id tras el upsert.`)
    }
    seedImagenes(dao, dev)
    seedDatasheets(dao, dev)
    seedPuertos(dao, dev)
    const c = seedAssertions(dao, dev, deviceId)
    assertionCount += c.assertionCount
    relationshipCount += c.relationshipCount
  }
  return { assertionCount, relationshipCount }
}

/** Arista explícita declarada en devices.json. */
type AristaSeed = NonNullable<SeedDevice['relationships']>[number]

/**
 * Segunda pasada: aristas explícitas declaradas en devices.json.
 */
export function seedAristasExplicitas(dao: CatalogDao, seed: Seed): number {
  let relationshipCount = 0
  for (const dev of seed.devices) {
    const deviceId = dao.deviceId(dev.slug)
    if (deviceId === undefined) {
      console.warn(`[WARN] dataset:build — aristas de "${dev.slug}": dispositivo sin id (se omite su bloque).`)
      continue
    }
    for (const rel of dev.relationships ?? []) {
      if (sembrarArista(dao, dev.slug, rel, deviceId)) relationshipCount++
    }
  }
  return relationshipCount
}

/** Siembra una arista; devuelve `false` (con aviso) si el dato no es resoluble. */
function sembrarArista(dao: CatalogDao, slug: string, rel: AristaSeed, deviceId: number): boolean {
  if (!findPredicate(rel.predicate)) {
    console.warn(`[WARN] dataset:build — predicado desconocido "${rel.predicate}" en "${slug}": arista omitida.`)
    return false
  }
  const objectId = resolveObjectId(dao, rel.objectType, rel.objectSlug)
  if (objectId === undefined) {
    console.warn(`[WARN] dataset:build — no se resolvió ${rel.objectType}:"${rel.objectSlug}" (${rel.predicate} de "${slug}"): arista omitida.`)
    return false
  }
  dao.addRelationship({
    subjectType: 'device',
    subjectId: deviceId,
    predicate: rel.predicate,
    objectType: rel.objectType,
    objectId,
  })
  return true
}

function resolveObjectId(dao: CatalogDao, type: string, slug: string): number | undefined {
  switch (type) {
    case 'layer':
      return dao.seedLayerId(slug)
    case 'standard':
      return dao.standardId(slug)
    case 'device':
      return dao.deviceId(slug)
    case 'medium':
      return dao.mediumId(slug, slug.startsWith('smf') || slug.startsWith('mmf') ? 'fibra' : 'inalambrico')
    default:
      // Tipo no contemplado: es un dato mal declarado, así que se dice cuál.
      console.warn(`[WARN] dataset:build — tipo de objeto no contemplado en las aristas: "${type}" (${slug}).`)
      return undefined
  }
}
