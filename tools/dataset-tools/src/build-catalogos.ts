import type { CatalogDao } from '@netatlas/data'
import type { Seed } from './build-tipos.js'

/**
 * Siembra de catálogos del dataset:build — catálogos maestros (categorías,
 * fabricantes, fuentes), catálogos cerrados (NET-HW-006), predicados
 * canónicos (§8.4) y capas OSI/TCP-IP semilla.
 */

export function seedCatalogosMaestros(dao: CatalogDao, seed: Seed): void {
  for (const cat of seed.categories) {
    dao.upsertCategory({
      code: cat.code,
      parentCode: cat.parentCode,
      nameEs: cat.nameEs,
      aliases: cat.aliases ?? [],
      sortOrder: cat.sortOrder ?? 0,
    })
  }
  for (const mfr of seed.manufacturers) {
    dao.upsertManufacturer({
      slug: mfr.slug,
      name: mfr.name,
      country: mfr.country,
      website: mfr.website,
      snmpEnterprise: (mfr as { snmpEnterprise?: number }).snmpEnterprise,
    })
  }
  for (const src of seed.sources) {
    dao.upsertSource({
      slug: src.slug,
      kind: src.kind,
      publisher: (src as { publisher?: string }).publisher,
      title: src.title,
      url: (src as { url?: string }).url,
      retrievedOn: (src as { retrievedOn?: string }).retrievedOn,
      authorityLevel: src.authorityLevel,
    })
  }
}

/** Catálogos cerrados: protocolos, estándares y medios (NET-HW-006). */
export function seedCatalogosCerrados(dao: CatalogDao, seed: Seed): void {
  for (const proto of seed.protocols) {
    dao.protocolId(proto.code, proto.name, proto.family, proto.osiLayer)
  }
  for (const std of seed.standards) {
    dao.standardId(`${std.org}/${std.identifier}`, std.title)
  }
  for (const med of seed.media) {
    dao.mediumId(med.code, med.kind as 'cobre' | 'fibra' | 'inalambrico' | 'coaxial', med.name)
  }
}

/** Predicados canónicos (§8.4) y capas OSI/TCP-IP semilla. */
export function seedPredicadosYCapas(dao: CatalogDao): void {
  seedPredicados(dao)
  seedCapas(dao)
}

/** Los 16 predicados canónicos del grafo (§8.4). */
function filasPredicados(): Parameters<CatalogDao['seedPredicates']>[0] {
  const predicateRows = [
    { code: 'manufactured-by', domain: ['device'], range: ['manufacturer'], cardinality: 'one' },
    { code: 'belongs-to-family', domain: ['device'], range: ['product-family'] },
    { code: 'has-category', domain: ['device'], range: ['category'], cardinality: 'one' },
    { code: 'has-role-category', domain: ['device'], range: ['category'] },
    { code: 'supports-protocol', domain: ['device'], range: ['protocol'] },
    { code: 'implements-standard', domain: ['device', 'protocol', 'interface'], range: ['standard'] },
    { code: 'uses-technology', domain: ['device'], range: ['technology'] },
    { code: 'operates-at-layer', domain: ['device', 'category'], range: ['layer'] },
    { code: 'terminates-medium', domain: ['device', 'interface'], range: ['medium'] },
    { code: 'compatible-with', domain: ['device', 'interface'], range: ['device', 'interface'], symmetric: true },
    { code: 'succeeds', domain: ['device'], range: ['device'], acyclic: true, inverse: 'precedes' },
    { code: 'precedes', domain: ['device'], range: ['device'], acyclic: true, inverse: 'succeeds' },
    { code: 'replaced-by', domain: ['device'], range: ['device'], acyclic: true },
    { code: 'similar-to', domain: ['device'], range: ['device'], symmetric: true },
    { code: 'evolves-into', domain: ['technology', 'category'], range: ['technology', 'category'], acyclic: true },
    { code: 'uses-interface', domain: ['device'], range: ['interface'] },
  ]
  // El DAO tipa estructuralmente; pasamos tal cual.
  return predicateRows as Parameters<CatalogDao['seedPredicates']>[0]
}

/** Capas semilla: OSI (1-7) y TCP/IP (1-4). */
function seedCapas(dao: CatalogDao): void {
  const OSI: [number, string, string][] = [
    [1, 'Física', 'Physical'],
    [2, 'Enlace de datos', 'Data Link'],
    [3, 'Red', 'Network'],
    [4, 'Transporte', 'Transport'],
    [5, 'Sesión', 'Session'],
    [6, 'Presentación', 'Presentation'],
    [7, 'Aplicación', 'Application'],
  ]
  const TCPIP: [number, string, string][] = [
    [1, 'Acceso a red', 'Network Access'],
    [2, 'Internet', 'Internet'],
    [3, 'Transporte', 'Transport'],
    [4, 'Aplicación', 'Application'],
  ]
  for (const [n, es, en] of OSI) dao.seedLayer(n, es, en, 'osi_layer')
  for (const [n, es, en] of TCPIP) dao.seedLayer(n, es, en, 'tcpip_layer')
}

/** Siembra la tabla de predicados (§8.4). */
function seedPredicados(dao: CatalogDao): void {
  dao.seedPredicates(filasPredicados())
}
