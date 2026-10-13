import type { SqliteDriver } from '../driver.js'
import { Device, Slug } from '@netatlas/domain'
import type { DeviceQuery, DeviceRepository, Page } from '@netatlas/domain'
import { DEVICE_SELECT, toDevice, type DeviceRow } from './device-repository-mapeo.js'
import { guardarDevice } from './device-repository-escritura.js'

/**
 * Adaptador SQLite del puerto DeviceRepository (NET-HW-003).
 * Mapea filas del esquema canónico a entidades de dominio (congeladas).
 * El mapeo vive en `device-repository-mapeo.ts` y la escritura en
 * `device-repository-escritura.ts`.
 */

export { SqliteCatalogRepository } from './catalog-repository.js'
// Re-export para consumidores que quieran construir slugs directamente
export { Slug }

export class SqliteDeviceRepository implements DeviceRepository {
  constructor(private readonly db: SqliteDriver) {}

  async findBySlug(slug: string): Promise<Device | undefined> {
    const row = this.db.prepare(`${DEVICE_SELECT} WHERE d.slug = ?`).get(slug) as DeviceRow | undefined
    return row ? toDevice(this.db, row) : undefined
  }

  async findByIds(ids: readonly number[]): Promise<readonly Device[]> {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`${DEVICE_SELECT} WHERE d.id IN (${placeholders})`)
      .all(...ids) as unknown as DeviceRow[]
    return rows.map((r) => toDevice(this.db, r))
  }

  async listByCategory(categoryCode: string, query: DeviceQuery): Promise<Page<Device>> {
    // Incluye subcategorías del árbol (CTE recursiva): cat:sw hereda sw-l2, sw-l3…
    const where = `
      EXISTS (
        WITH RECURSIVE sub(cat_id) AS (
          SELECT id FROM category WHERE code = ?
          UNION ALL
          SELECT c.id FROM category c JOIN sub s ON c.parent_id = s.cat_id
        )
        SELECT 1 FROM sub s2 WHERE s2.cat_id = d.category_id
      )
    `
    return this.paginate(DEVICE_SELECT, where, [categoryCode], query)
  }

  async findByManufacturer(manufacturerSlug: string, query: DeviceQuery): Promise<Page<Device>> {
    const where = 'EXISTS (SELECT 1 FROM manufacturer m2 WHERE m2.id = d.manufacturer_id AND m2.slug = ?)'
    return this.paginate(DEVICE_SELECT, where, [manufacturerSlug], query)
  }

  async count(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM device').get()
    return Number(row?.c ?? 0)
  }

  async save(device: Device): Promise<void> {
    guardarDevice(this.db, device)
  }

  /** Paginación por cursor sobre una consulta base (sección 23.1). */
  private paginate(baseSql: string, whereSql: string, params: (string | number)[], query: DeviceQuery): Page<Device> {
    const limit = Math.min(query.limit, 500)
    const conditions = [whereSql]
    if (query.lifecycleStatus) {
      conditions.push('d.lifecycle_status = ?')
      params = [...params, query.lifecycleStatus]
    }
    if (query.cursor) {
      conditions.push('d.id > ?')
      params = [...params, Number(query.cursor)]
    }
    const rows = this.db
      .prepare(`${baseSql} WHERE ${conditions.join(' AND ')} ORDER BY d.id LIMIT ?`)
      .all(...params, limit + 1) as unknown as DeviceRow[]
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => toDevice(this.db, r))
    const last = items[items.length - 1]
    return { items, nextCursor: hasMore && last ? String(rows[limit - 1]!.id) : undefined }
  }
}