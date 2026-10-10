import type { SqliteDriver, SqlRow } from '../driver.js'
import { Category, Manufacturer } from '@netatlas/domain'
import type { CatalogRepository } from '@netatlas/domain'

/**
 * Adaptador SQLite del puerto CatalogRepository (NET-HW-003/023): fabricantes,
 * categorías y catálogos cerrados (protocolos, estándares, medios).
 */

export class SqliteCatalogRepository implements CatalogRepository {
  constructor(private readonly db: SqliteDriver) {}

  async manufacturerBySlug(slug: string): Promise<Manufacturer | undefined> {
    const row = this.db
      .prepare('SELECT slug, name, country, founded_year, website, status, snmp_enterprise FROM manufacturer WHERE slug = ?')
      .get(slug) as
      | { slug: string; name: string; country: string | null; founded_year: number | null; website: string | null; status: string; snmp_enterprise: number | null }
      | undefined
    if (!row) return undefined
    return Manufacturer.hydrate({
      slug: row.slug,
      name: row.name,
      country: row.country ?? undefined,
      foundedYear: row.founded_year ?? undefined,
      website: row.website ?? undefined,
      status: (row.status ?? 'active') as 'active' | 'inactive' | 'acquired' | 'defunct',
      snmpEnterprise: row.snmp_enterprise !== null ? Number(row.snmp_enterprise) : undefined,
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
      parentCode: codigoPadre(this.db, row.parent_id),
      nameEs: row.name_es,
      nameEn: row.name_en ?? undefined,
      aliases: JSON.parse(row.aliases_json) as string[],
      definition: row.definition ?? undefined,
      sortOrder: Number(row.sort_order),
    })
  }

  async listManufacturers(): Promise<readonly Manufacturer[]> {
    const rows = this.db
      .prepare('SELECT slug, name, country, founded_year, website, status, snmp_enterprise FROM manufacturer ORDER BY name')
      .all() as SqlRow[]
    return rows.map((r) => this.toManufacturer(r))
  }

  async listCategories(): Promise<readonly Category[]> {
    const rows = this.db
      .prepare('SELECT code, parent_id, name_es, name_en, aliases_json, definition, sort_order FROM category ORDER BY sort_order')
      .all() as SqlRow[]
    return rows.map((r) => this.toCategory(r))
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
      osiLayer: Number(r.osi_layer ?? 0),
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
      maxSpeedMbps: r.max_speed_mbps !== null && r.max_speed_mbps !== undefined ? Number(r.max_speed_mbps) : undefined,
    }))
  }

  /** Fila cruda de fabricante → entidad de dominio. */
  private toManufacturer(r: SqlRow): Manufacturer {
    return Manufacturer.hydrate({
      slug: String(r.slug),
      name: String(r.name),
      country: r.country !== null && r.country !== undefined ? String(r.country) : undefined,
      foundedYear: r.founded_year !== null && r.founded_year !== undefined ? Number(r.founded_year) : undefined,
      website: r.website !== null && r.website !== undefined ? String(r.website) : undefined,
      status: (r.status !== null && r.status !== undefined ? String(r.status) : 'active') as 'active' | 'inactive' | 'acquired' | 'defunct',
      snmpEnterprise: r.snmp_enterprise !== null && r.snmp_enterprise !== undefined ? Number(r.snmp_enterprise) : undefined,
    })
  }

  /** Fila cruda de categoría → entidad de dominio (padre resuelto por id). */
  private toCategory(r: SqlRow): Category {
    const parent_id = r.parent_id === null || r.parent_id === undefined ? null : Number(r.parent_id)
    return Category.hydrate({
      code: String(r.code),
      parentCode: codigoPadre(this.db, parent_id),
      nameEs: String(r.name_es),
      nameEn: r.name_en !== null && r.name_en !== undefined ? String(r.name_en) : undefined,
      aliases: JSON.parse(String(r.aliases_json)) as string[],
      definition: r.definition !== null && r.definition !== undefined ? String(r.definition) : undefined,
      sortOrder: Number(r.sort_order),
    })
  }
}

/**
 * Código del padre de una categoría, o `undefined` si es raíz. Un id de padre
 * que no existe en la tabla se trata como raíz y se registra: es dato roto.
 */
function codigoPadre(db: SqliteDriver, parentId: number | null | undefined): string | undefined {
  if (parentId === null || parentId === undefined) return undefined
  const row = db.prepare('SELECT code FROM category WHERE id = ?').get(parentId) as { code?: string } | undefined
  const code = row?.code
  if (code === undefined) {
    console.warn(`[WARN] categoría con padre inexistente (id ${parentId}); se trata como raíz`)
    return undefined
  }
  return String(code)
}