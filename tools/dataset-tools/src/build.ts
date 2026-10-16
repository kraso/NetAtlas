import {
  CatalogDao,
  NodeSqliteDriver,
  applyMigrations,
  dirname,
  exigirFechaPublicacion,
  fechaDePublicacion,
  fileURLToPath,
  join,
  loadMigrations,
  loadSeed,
  relojFijo,
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
import {
  contarCatalogos,
  contarFilas,
  versionDeEsquema,
  type ConteosCatalogos,
  type ConteosDataset,
} from './build-conteos.js'
import type { ConteosSiembra } from './build-piezas.js'
import type { Seed } from './build-tipos.js'
import type { Clock } from '@netatlas/domain'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

/** Resultado de la construcción del dataset (conteos + versión de esquema). */
export interface ResultadoBuild {
  deviceCount: number
  relationshipCount: number
  assertionCount: number
  catalogCounts: ConteosCatalogos
  schemaVersion: number
}

/** Opciones del build. La fecha de publicación es lo único que se puede fijar. */
export interface OpcionesBuild {
  /** Fecha de publicación (ISO 8601). Por defecto: env, manifiesto previo o hoy. */
  readonly publishedOn?: string
}

/**
 * dataset:build — construye el SQLite del dataset seed a partir de las fuentes JSON.
 * El resultado es el artefacto `netatlas-seed.sqlite` (esquema + catálogos master +
 * fichas + assertions + aristas), base del MVP (F1). Cada pasada vive en un módulo
 * `build-*.ts` (catálogos, dispositivos, atributos, estándares, topologías,
 * manifiesto) y aquí solo se orquesta el orden.
 *
 * El build es reproducible: todas las marcas de tiempo del archivo salen de un
 * reloj fijo anclado a la fecha de publicación del dataset, así que dos
 * construcciones de las mismas fuentes dan bytes idénticos y el `sha256` del
 * manifiesto describe el contenido, no el día en que se construyó.
 *
 * La fecha se valida antes de tocar el destino: una fecha inválida no puede
 * borrar el artefacto previo para luego fallar al escribir el manifiesto.
 */
export function buildSeedDatabase(seedDir: string, outPath: string, opciones: OpcionesBuild = {}): ResultadoBuild {
  const seed = loadSeed(seedDir)
  const publishedOn = opciones.publishedOn
    ? exigirFechaPublicacion(opciones.publishedOn, 'publishedOn')
    : fechaDePublicacion(outPath)
  const reloj = relojFijo(`${publishedOn}T00:00:00.000Z`)
  const driver = abrirDriverLimpio(outPath, reloj)
  const conteos = sembrarYContar(driver, new CatalogDao(driver, reloj), seed)
  escribirCierre(outPath, conteos, publishedOn)
  return {
    deviceCount: conteos.deviceCount,
    relationshipCount: conteos.relationshipCount,
    assertionCount: conteos.assertionCount,
    catalogCounts: conteos.catalogCounts,
    schemaVersion: conteos.schemaVersion,
  }
}

/**
 * Siembra y cuenta, cerrando el driver siempre: si la siembra revienta, el
 * fallo se propaga con el archivo SQLite ya cerrado en vez de dejar el handle
 * abierto. El WAL se cierra después, en `escribirCierre`.
 */
function sembrarYContar(driver: NodeSqliteDriver, dao: CatalogDao, seed: Seed): ConteosDataset {
  try {
    const siembra = sembrarTodo(dao, driver, seed)
    return recolectarConteos(driver, siembra, seed)
  } finally {
    driver.close()
  }
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
function escribirCierre(outPath: string, conteos: ConteosDataset, publishedOn: string): void {
  cerrarWal(outPath)
  const escrito = escribirManifiesto({
    outPath,
    publishedOn,
    schemaVersion: conteos.schemaVersion,
    devices: conteos.deviceCount,
    relationshipCount: conteos.relationshipCount,
    assertionCount: conteos.assertionCount,
    catalogCounts: conteos.catalogCounts,
    topologiasCount: conteos.topologiasCount,
  })
  if (!escrito) console.info(`[dataset:build] manifiesto sin cambios: se conserva el de ${publishedOn}.`)
  cerrarWal(outPath)
}

/**
 * Prepara una base limpia: elimina el artefacto previo (es inmutable por
 * release) y aplica las migraciones, cerrando el driver si alguna falla.
 */
function abrirDriverLimpio(outPath: string, reloj: Clock): NodeSqliteDriver {
  rmSync(outPath, { force: true })
  cerrarWal(outPath)
  const driver = new NodeSqliteDriver(outPath)
  try {
    applyMigrations(driver, loadMigrations(MIGRATIONS_DIR), reloj)
  } catch (err) {
    driver.close()
    // Un `throw` no siempre es un `Error`: se conserva el contexto del fallo
    // sin asumir que existe `.message`.
    throw new Error(`dataset:build — fallo al aplicar migraciones: ${err instanceof Error ? err.message : String(err)}`)
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

/** Cierra el WAL dejando un único archivo SQLite portable (checkpoint + delete). */
function cerrarWal(outPath: string): void {
  // El WAL puede no existir (el journal se crea al escribir): borrarlo es
  // idempotente, no un fallo que haya que reportar.
  rmSync(`${outPath}-wal`, { force: true })
  rmSync(`${outPath}-shm`, { force: true })
}
