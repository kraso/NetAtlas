/**
 * Adaptador SQLite del asistente IA (sección 21 / F7): ToolContext real sobre
 * los repositorios del dataset + generador del conjunto de oro + oráculo de
 * verificación de hechos contra la base validada.
 *
 * Cero bypass de validaciones: la recuperación lee assertions con fuente,
 * puertos e inventario reales; la comparación usa el motor puro; la topología
 * se genera con invariantes del agregado y se persiste vía repositorio.
 * La implementación vive en `sqlite-assistant-*.ts`; esta clase solo delega.
 */
import type { SqliteDriver } from '../driver.js'
import type { SearchIndex, ToolContext } from '@netatlas/domain'
import { generarTopologia, parsearSpec } from '@netatlas/domain'
import {
  buscarEnCatalogo,
  capasDeDispositivo,
  compatiblesDe,
  compararDispositivos,
  construirTopologia,
  datosDeDispositivo,
  resolverEntidad,
  sucesoresDe,
} from './sqlite-assistant-piezas.js'

export class SqliteToolContext implements ToolContext {
  constructor(
    private readonly db: SqliteDriver,
    /** Índice de búsqueda inyectado (FTS5 de @netatlas/search, wa-sqlite, …). */
    private readonly search: SearchIndex,
  ) {}

  searchCatalog(dsl: string, limit: number): Promise<readonly { slug: string; nombre: string; categoria: string }[]> {
    return buscarEnCatalogo(this.db, this.search, dsl, limit)
  }

  getDevice(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    return datosDeDispositivo(this.db, slug)
  }

  compareDevices(ids: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
    return compararDispositivos(this.db, ids)
  }

  findCompatible(device: string, constraint: string | undefined): Promise<Readonly<Record<string, unknown>>> {
    return compatiblesDe(this.db, device, constraint)
  }

  buildTopology(spec: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    return construirTopologia(this.db, spec)
  }

  whatLayers(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    return capasDeDispositivo(this.db, slug)
  }

  successors(slug: string): Promise<readonly { relacion: string; slug: string; nombre: string }[]> {
    return sucesoresDe(this.db, slug)
  }

  /** Resuelve un nombre comercial ("catalyst 9300", "aruba 2930f") al slug real. */
  resolverEntidad(textoNormalizado: string): Promise<string | undefined> {
    return resolverEntidad(this.db, textoNormalizado)
  }
}

export { crearOracleSqlite } from './sqlite-assistant-oraculo.js'
export { construirConjuntoOroDesdeDataset } from './sqlite-assistant-conjunto-oro.js'
export { generarTopologia, parsearSpec }
