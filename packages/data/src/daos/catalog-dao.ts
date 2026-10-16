import type { Clock } from '@netatlas/domain'
import type { SqliteDriver } from '../driver.js'
import { relojDelSistema } from '../reloj.js'
import type {
  AssertionRow,
  AttributeDefRow,
  CategoryRow,
  DatasheetSeedRow,
  DeviceRow,
  ImageSeedRow,
  ManufacturerRow,
  PortRow,
  PredicateSeedRow,
  RelationshipRow,
  SourceRow,
} from './catalog-tipos.js'
import {
  addAssertion,
  addDatasheet,
  addImage,
  addPort,
  addRelationship,
  bulkInsertDevices,
  categoryId,
  clearPorts,
  defineAttribute,
  deviceId,
  eliminarDeviceCompleto,
  existingStandardRefs,
  manufacturerId,
  mediumId,
  protocolId,
  seedLayer,
  seedLayerId,
  seedPredicates,
  setDeviceAttribute,
  sourceId,
  standardId,
  upsertCategory,
  upsertDevice,
  upsertManufacturer,
  upsertSource,
} from './catalog-piezas.js'

/**
 * DAO de catálogo (Fase 0): siembra y consulta de entidades núcleo.
 * Uso: dataset seed (20 fichas piloto) y tools/datagen (10k sintéticos).
 * En F1 se completa con los repositorios que implementan los puertos del dominio.
 * La implementación vive en `catalog-*.ts` (funciones libres sobre el driver);
 * esta clase solo delega para mantener la API usada por el resto del monorepo.
 */

export type {
  AssertionRow,
  CategoryRow,
  DeviceRow,
  ManufacturerRow,
  PortRow,
  RelationshipRow,
  SourceRow,
} from './catalog-tipos.js'

export class CatalogDao {
  /**
   * El reloj es el sello de tiempo de las filas que van al dataset
   * (`created_at`/`updated_at`). Por defecto es el del sistema; `dataset:build`
   * inyecta uno fijo para que el archivo sea reproducible.
   */
  constructor(
    private readonly db: SqliteDriver,
    private readonly clock: Clock = relojDelSistema,
  ) {}

  /** Instante actual en ISO 8601, para las filas que entran al dataset. */
  private ahora(): string {
    return this.clock.now().toISOString()
  }

  // ── Fabricantes y categorías ─────────────────────────────────────
  upsertManufacturer(row: ManufacturerRow): number {
    return upsertManufacturer(this.db, row)
  }

  manufacturerId(slug: string): number | undefined {
    return manufacturerId(this.db, slug)
  }

  upsertCategory(row: CategoryRow): number {
    return upsertCategory(this.db, row)
  }

  categoryId(code: string): number | undefined {
    return categoryId(this.db, code)
  }

  // ── Dispositivos e inventario ────────────────────────────────────
  upsertDevice(row: DeviceRow): number {
    return upsertDevice(this.db, row, this.ahora())
  }

  deviceId(slug: string): number | undefined {
    return deviceId(this.db, slug)
  }

  eliminarDeviceCompleto(slug: string): boolean {
    return eliminarDeviceCompleto(this.db, slug)
  }

  bulkInsertDevices(rows: readonly DeviceRow[]): void {
    bulkInsertDevices(this.db, rows, this.ahora())
  }

  clearPorts(deviceSlug: string): void {
    clearPorts(this.db, deviceSlug)
  }

  addPort(row: PortRow): void {
    addPort(this.db, row)
  }

  addDatasheet(row: DatasheetSeedRow): number {
    return addDatasheet(this.db, row)
  }

  addImage(row: ImageSeedRow): number {
    return addImage(this.db, row)
  }

  // ── Fuentes, assertions y aristas ────────────────────────────────
  upsertSource(row: SourceRow): number {
    return upsertSource(this.db, row)
  }

  sourceId(slug: string): number | undefined {
    return sourceId(this.db, slug)
  }

  addAssertion(row: AssertionRow): number {
    return addAssertion(this.db, row)
  }

  addRelationship(row: RelationshipRow): void {
    addRelationship(this.db, row, this.ahora())
  }

  seedPredicates(rows: readonly PredicateSeedRow[]): void {
    seedPredicates(this.db, rows)
  }

  existingStandardRefs(idDeDispositivo: number): string[] {
    return existingStandardRefs(this.db, idDeDispositivo)
  }

  // ── Catálogos auxiliares ─────────────────────────────────────────
  protocolId(code: string, name?: string, family = 'internet', osiLayer = 3): number {
    return protocolId(this.db, code, name, family, osiLayer)
  }

  standardId(ref: string, title?: string): number {
    return standardId(this.db, ref, title)
  }

  mediumId(code: string, kind: 'cobre' | 'fibra' | 'inalambrico' | 'coaxial', name?: string): number {
    return mediumId(this.db, code, kind, name)
  }

  seedLayer(number: number, nameEs: string, nameEn: string, table: 'osi_layer' | 'tcpip_layer'): void {
    seedLayer(this.db, number, nameEs, nameEn, table)
  }

  seedLayerId(number: string): number | undefined {
    return seedLayerId(this.db, number)
  }

  // ── EAV (§9.4) ───────────────────────────────────────────────────
  defineAttribute(def: AttributeDefRow): number {
    return defineAttribute(this.db, def)
  }

  setDeviceAttribute(deviceSlug: string, attributeKey: string, value: number | string | boolean | null, assertionId?: number): void {
    setDeviceAttribute(this.db, deviceSlug, attributeKey, value, assertionId)
  }
}
