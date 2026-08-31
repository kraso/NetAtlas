import type { SqliteDriver, SqlRow } from '../driver.js'
import {
  Device,
  Port,
  Slug,
  Manufacturer,
  Category,
  OsiProfileValue,
  requireLifecycleStatus,
} from '@netatlas/domain'
import type {
  DeviceRepository,
  CatalogRepository,
  DeviceQuery,
  Page,
} from '@netatlas/domain'

/**
 * Adaptador SQLite del puerto DeviceRepository (NET-HW-003).
 * Mapea filas del esquema canónico a entidades de dominio (congeladas).
 * Igual SQL corre en node:sqlite (desktop/CLI) y wa-sqlite (PWA, F1).
 */

interface DeviceRow {
  id: number
  slug: string
  name: string
  commercial_name: string | null
  manufacturer_slug: string
  family_slug: string | null
  category_code: string
  lifecycle_status: string
  osi_profile_json: string | null
  summary: string | null
  model: string | null
  sku: string | null
  released_on: string | null
  eol_on: string | null
  eos_on: string | null
}

interface PortRow {
  label: string
  interface_code: string
  quantity: number
  speeds_json: string
  poe_standard: string | null
  role: string | null
  notes: string | null
}

const DEVICE_SELECT = `
  SELECT d.id, d.slug, d.name, d.commercial_name, d.model, d.sku,
         d.released_on, d.eol_on, d.eos_on, d.lifecycle_status,
         d.osi_profile_json, d.summary,
         m.slug AS manufacturer_slug, f.slug AS family_slug,
         c.code AS category_code
  FROM device d
  JOIN manufacturer m ON m.id = d.manufacturer_id
  LEFT JOIN product_family f ON f.id = d.family_id
  JOIN category c ON c.id = d.category_id
`

export class SqliteDeviceRepository implements DeviceRepository {
  constructor(private readonly db: SqliteDriver) {}

  async findBySlug(slug: string): Promise<Device | undefined> {
    const row = this.db.prepare(`${DEVICE_SELECT} WHERE d.slug = ?`).get(slug) as DeviceRow | undefined
    return row ? this.toDevice(row) : undefined
  }

  async findByIds(ids: readonly number[]): Promise<readonly Device[]> {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`${DEVICE_SELECT} WHERE d.id IN (${placeholders})`)
      .all(...ids) as unknown as DeviceRow[]
    return rows.map((r) => this.toDevice(r))
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
    const manufacturerId = this.db
      .prepare('SELECT id FROM manufacturer WHERE slug = ?')
      .get(device.manufacturerSlug)
    const categoryId = this.db.prepare('SELECT id FROM category WHERE code = ?').get(device.categoryCode)
    if (!manufacturerId || !categoryId) {
      throw new Error(`save: fabricante o categoría inexistente para "${device.slug}".`)
    }
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO device (slug, name, commercial_name, manufacturer_id, category_id,
                             lifecycle_status, osi_profile_json, summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           commercial_name = excluded.commercial_name,
           manufacturer_id = excluded.manufacturer_id,
           category_id = excluded.category_id,
           lifecycle_status = excluded.lifecycle_status,
           osi_profile_json = excluded.osi_profile_json,
           summary = excluded.summary,
           updated_at = excluded.updated_at`,
      )
      .run(
        device.slug.value,
        device.name,
        device.commercialName ?? null,
        Number(manufacturerId.id),
        Number(categoryId.id),
        device.lifecycleStatus,
        device.osiProfile ? JSON.stringify(device.osiProfile.profile) : null,
        device.summary ?? null,
        now,
        now,
      )

    // Inventario de puertos: reemplazo completo (idempotente).
    const deviceId = this.deviceIdFor(device.slug.value)
    if (deviceId !== undefined) {
      this.db.prepare('DELETE FROM port WHERE device_id = ?').run(deviceId)
      for (const port of device.ports) {
        let interfaceId = this.db
          .prepare('SELECT id FROM interface WHERE code = ?')
          .get(port.interfaceCode) as { id: number } | undefined
        if (!interfaceId) {
          const res = this.db
            .prepare('INSERT INTO interface (code, kind) VALUES (?, ?)')
            .run(port.interfaceCode, inferInterfaceKind(port.interfaceCode))
          interfaceId = { id: Number(res.lastInsertRowid) }
        }
        this.db
          .prepare(
            `INSERT INTO port (device_id, interface_id, label, quantity, speeds_json, poe_standard, role, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            deviceId,
            interfaceId.id,
            port.label,
            port.quantity,
            JSON.stringify(port.speedsMbps),
            port.poeStandard ?? null,
            port.role ?? null,
            port.notes ?? null,
          )
      }
    }
  }

  private deviceIdFor(slug: string): number | undefined {
    const row = this.db.prepare('SELECT id FROM device WHERE slug = ?').get(slug)
    return row ? Number((row as { id: number }).id) : undefined
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
    const items = rows.slice(0, limit).map((r) => this.toDevice(r))
    const last = items[items.length - 1]
    return { items, nextCursor: hasMore && last ? String(rows[limit - 1]!.id) : undefined }
  }

  private toDevice(row: DeviceRow): Device {
    const ports = this.db
      .prepare(
        `SELECT p.label, i.code AS interface_code, p.quantity, p.speeds_json, p.poe_standard, p.role, p.notes
         FROM port p JOIN interface i ON i.id = p.interface_id
         WHERE p.device_id = ? ORDER BY p.id`,
      )
      .all(row.id) as unknown as PortRow[]
    return Device.hydrate({
      slug: row.slug,
      name: row.name,
      commercialName: row.commercial_name ?? undefined,
      manufacturerSlug: row.manufacturer_slug,
      familySlug: row.family_slug ?? undefined,
      categoryCode: row.category_code,
      model: row.model ?? undefined,
      sku: row.sku ?? undefined,
      releasedOn: row.released_on ?? undefined,
      eolOn: row.eol_on ?? undefined,
      eosOn: row.eos_on ?? undefined,
      lifecycleStatus: requireLifecycleStatus(row.lifecycle_status),
      osiProfile: row.osi_profile_json
        ? OsiProfileValue.create(JSON.parse(row.osi_profile_json) as Parameters<typeof OsiProfileValue.create>[0])
        : undefined,
      summary: row.summary ?? undefined,
      ports: ports.map((p) =>
        Port.create({
          label: p.label,
          interfaceCode: p.interface_code,
          quantity: Number(p.quantity),
          speedsMbps: (JSON.parse(p.speeds_json) as number[]).map(Number),
          poeStandard: (p.poe_standard ?? undefined) as '802.3af' | '802.3at' | '802.3bt' | undefined,
          role: (p.role ?? undefined) as 'access' | 'uplink' | 'mgmt' | 'console' | 'stack' | undefined,
          notes: p.notes ?? undefined,
        }),
      ),
    })
  }
}

export class SqliteCatalogRepository implements CatalogRepository {
  constructor(private readonly db: SqliteDriver) {}

  async manufacturerBySlug(slug: string): Promise<Manufacturer | undefined> {
    const row = this.db
      .prepare('SELECT slug, name, country, founded_year, website, status FROM manufacturer WHERE slug = ?')
      .get(slug) as
      | { slug: string; name: string; country: string | null; founded_year: number | null; website: string | null; status: string }
      | undefined
    if (!row) return undefined
    return Manufacturer.hydrate({
      slug: row.slug,
      name: row.name,
      country: row.country ?? undefined,
      foundedYear: row.founded_year ?? undefined,
      website: row.website ?? undefined,
      status: (row.status ?? 'active') as 'active' | 'inactive' | 'acquired' | 'defunct',
    })
  }

  async categoryByCode(code: string): Promise<Category | undefined> {
    const row = this.db
      .prepare('SELECT code, parent_id, name_es, name_en, aliases_json, definition, sort_order FROM category WHERE code = ?')
      .get(code) as
      | { code: string; parent_id: number | null; name_es: string; name_en: string | null; aliases_json: string; definition: string | null; sort_order: number }
      | undefined
    if (!row) return undefined
    return Category.hydrate({
      code: row.code,
      parentCode: row.parent_id !== null ? String(this.db.prepare('SELECT code FROM category WHERE id = ?').get(row.parent_id)?.code) : undefined,
      nameEs: row.name_es,
      nameEn: row.name_en ?? undefined,
      aliases: JSON.parse(row.aliases_json) as string[],
      definition: row.definition ?? undefined,
      sortOrder: Number(row.sort_order),
    })
  }

  async listCategories(): Promise<readonly Category[]> {
    const rows = this.db
      .prepare('SELECT code, parent_id, name_es, name_en, aliases_json, definition, sort_order FROM category ORDER BY sort_order')
      .all() as SqlRow[]
    const categories = rows.map((r) =>
      Category.hydrate({
        code: String(r.code),
        parentCode: r.parent_id !== null ? String(this.db.prepare('SELECT code FROM category WHERE id = ?').get(Number(r.parent_id))?.code) : undefined,
        nameEs: String(r.name_es),
        nameEn: r.name_en !== null ? String(r.name_en) : undefined,
        aliases: JSON.parse(String(r.aliases_json)) as string[],
        definition: r.definition !== null ? String(r.definition) : undefined,
        sortOrder: Number(r.sort_order),
      }),
    )
    return categories
  }

  // ── Catálogos cerrados para exploradores (NET-HW-023) ─────────────────────

  async listProtocols(): Promise<readonly { code: string; name: string; family: string; osiLayer: number }[]> {
    const rows = this.db
      .prepare('SELECT code, name, family, osi_layer FROM protocol ORDER BY family, code')
      .all() as SqlRow[]
    return rows.map((r) => ({
      code: String(r.code),
      name: String(r.name),
      family: String(r.family),
      osiLayer: Number(r.osi_layer),
    }))
  }

  async listStandards(): Promise<readonly { org: string; identifier: string; title: string }[]> {
    const rows = this.db
      .prepare('SELECT org, identifier, title FROM standard ORDER BY org, identifier')
      .all() as SqlRow[]
    return rows.map((r) => ({
      org: String(r.org),
      identifier: String(r.identifier),
      title: String(r.title),
    }))
  }

  async listMedia(): Promise<readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[]> {
    const rows = this.db
      .prepare('SELECT code, kind, name, max_speed_mbps FROM medium ORDER BY kind, code')
      .all() as SqlRow[]
    return rows.map((r) => ({
      code: String(r.code),
      kind: String(r.kind),
      name: String(r.name),
      maxSpeedMbps: r.max_speed_mbps !== null ? Number(r.max_speed_mbps) : undefined,
    }))
  }
}

// Re-export para consumidores que quieran construir slugs directamente
export { Slug }

/** Infiere el kind de una interfaz por su código (misma heurística que el DAO). */
function inferInterfaceKind(code: string): string {
  if (code.startsWith('sfp') || code.includes('10g')) return 'fibra'
  if (code.startsWith('rj') || code.startsWith('coaxial')) return 'ethernet'
  if (code === 'console') return 'consola'
  if (code.startsWith('usb')) return 'usb'
  if (code === 'serial') return 'serial'
  if (code.startsWith('wifi')) return 'wifi'
  return 'ethernet'
}