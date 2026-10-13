import {
  CatalogDao,
  NodeSqliteDriver,
  applyMigrations,
  dirname,
  fileURLToPath,
  join,
  loadMigrations,
  loadSeed,
  rmSync,
  escribirManifiesto,
  seedAristasExplicitas,
  seedAttributes,
  seedCatalogosCerrados,
  seedCatalogosMaestros,
  seedDerivedStandards,
  seedDispositivos,
  seedPredicadosYCapas,
  seedTopologies,
} from './build-piezas.js'
import type { ConteosSiembra } from './build-piezas.js'
import type { Seed } from './build-tipos.js'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

/** Resultado de la construcción del dataset (conteos + versión de esquema). */
export interface ResultadoBuild {
  deviceCount: number
  relationshipCount: number
  assertionCount: number
  catalogCounts: { protocols: number; standards: number; media: number; manufacturers: number; categories: number }
  schemaVersion: number
}

/**
 * dataset:build — construye el SQLite del dataset seed a partir de las fuentes JSON.
 * El resultado es el artefacto `netatlas-seed.sqlite` (esquema + catálogos master +
 * fichas + assertions + aristas), base del MVP (F1). Cada pasada vive en un módulo
 * `build-*.ts` (catálogos, dispositivos, atributos, estándares, topologías,
 * manifiesto) y aquí solo se orquesta el orden.
 */
export function buildSeedDatabase(seedDir: string, outPath: string): ResultadoBuild {
  const seed = loadSeed(seedDir)
  const driver = abrirDriverLimpio(outPath)
  const dao = new CatalogDao(driver)
  const siembra = sembrarTodo(dao, driver, seed)
  const conteos = recolectarConteos(driver, siembra, seed)
  driver.close()
  escribirCierre(outPath, conteos)
  return {
    deviceCount: conteos.deviceCount,
    relationshipCount: conteos.relationshipCount,
    assertionCount: conteos.assertionCount,
    catalogCounts: conteos.catalogCounts,
    schemaVersion: conteos.schemaVersion,
  }
}

/** Conteos que describen el dataset recién sembrado. */
interface ConteosDataset {
  readonly deviceCount: number
  readonly relationshipCount: number
  readonly assertionCount: number
  readonly catalogCounts: ResultadoBuild['catalogCounts']
  readonly topologiasCount: number
  readonly schemaVersion: number
}

/** Pasadas de siembra en orden: catálogos → dispositivos → EAV → derivados → topologías. */
function sembrarTodo(dao: CatalogDao, driver: NodeSqliteDriver, seed: Seed): ConteosSiembra {
  seedCatalogosMaestros(dao, seed)
  seedCatalogosCerrados(dao, seed)
  seedPredicadosYCapas(dao)
  const siembra = sembrarDispositivos(dao, seed)
  seedAttributes(dao, seed)
  const derived = seedDerivedStandards(dao, seed)
  seedTopologies(dao, driver)
  return {
    assertionCount: siembra.assertionCount + derived.assertionCount,
    relationshipCount: siembra.relationshipCount + derived.relationshipCount,
  }
}

/** Lee de la base los conteos que describen el dataset generado. */
function recolectarConteos(driver: NodeSqliteDriver, siembra: ConteosSiembra, seed: Seed): ConteosDataset {
  return {
    deviceCount: seed.devices.length,
    relationshipCount: siembra.relationshipCount,
    assertionCount: siembra.assertionCount,
    catalogCounts: contarCatalogos(driver),
    topologiasCount: contarFilas(driver, 'topology'),
    schemaVersion: versionDeEsquema(driver),
  }
}

/** Cierra el WAL y escribe el manifiesto firmable (deja un archivo portable). */
function escribirCierre(outPath: string, conteos: ConteosDataset): void {
  cerrarWal(outPath)
  escribirManifiesto({
    outPath,
    schemaVersion: conteos.schemaVersion,
    devices: conteos.deviceCount,
    relationshipCount: conteos.relationshipCount,
    assertionCount: conteos.assertionCount,
    catalogCounts: conteos.catalogCounts,
    topologiasCount: conteos.topologiasCount,
  })
  cerrarWal(outPath)
}

/**
 * Prepara una base limpia: elimina el artefacto previo (es inmutable por
 * release) y aplica las migraciones, cerrando el driver si alguna falla.
 */
function abrirDriverLimpio(outPath: string): NodeSqliteDriver {
  rmSync(outPath, { force: true })
  cerrarWal(outPath)
  const driver = new NodeSqliteDriver(outPath)
  try {
    applyMigrations(driver, loadMigrations(MIGRATIONS_DIR))
  } catch (err) {
    driver.close()
    throw new Error(`dataset:build — fallo al aplicar migraciones: ${(err as Error).message}`)
  }
  return driver
}

/** Dispositivos (puertos, assertions, aristas) + segunda pasada de aristas explícitas. */
function sembrarDispositivos(dao: CatalogDao, seed: Seed): { assertionCount: number; relationshipCount: number } {
  const siembra = seedDispositivos(dao, seed)
  return {
    assertionCount: siembra.assertionCount,
    relationshipCount: siembra.relationshipCount + seedAristasExplicitas(dao, seed),
  }
}

/** Conteos de catálogos cerrados leídos de la base ya sembrada. */
function contarCatalogos(driver: NodeSqliteDriver): ResultadoBuild['catalogCounts'] {
  return {
    protocols: contarFilas(driver, 'protocol'),
    standards: contarFilas(driver, 'standard'),
    media: contarFilas(driver, 'medium'),
    manufacturers: contarFilas(driver, 'manufacturer'),
    categories: contarFilas(driver, 'category'),
  }
}

/** Cuenta las filas de una tabla del dataset. */
function contarFilas(driver: NodeSqliteDriver, tabla: string): number {
  return Number(driver.prepare(`SELECT COUNT(*) AS c FROM ${tabla}`).get()?.c ?? 0)
}

/** Última versión de esquema aplicada. */
function versionDeEsquema(driver: NodeSqliteDriver): number {
  return Number(driver.prepare('SELECT MAX(version) AS v FROM schema_version').get()?.v ?? 0)
}

/** Cierra el WAL dejando un único archivo SQLite portable (checkpoint + delete). */
function cerrarWal(outPath: string): void {
  rmSync(`${outPath}-wal`, { force: true })
  rmSync(`${outPath}-shm`, { force: true })
}
