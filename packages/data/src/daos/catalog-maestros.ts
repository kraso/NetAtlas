import type { SqliteDriver } from '../driver.js'
import type { CategoryRow, ManufacturerRow, SourceRow } from './catalog-tipos.js'

/**
 * Catálogos maestros y auxiliares (fabricantes, categorías, fuentes,
 * protocolos/estándares/medios/capas): funciones libres sobre el driver que
 * `CatalogDao` delega sin cambiar su API.
 */

// ── Fabricantes ────────────────────────────────────────────────────────

export function upsertManufacturer(db: SqliteDriver, row: ManufacturerRow): number {
  const existing = db.prepare('SELECT id FROM manufacturer WHERE slug = ?').get(row.slug)
  if (existing) return Number(existing.id)
  const res = db
    .prepare('INSERT INTO manufacturer (slug, name, country, website, snmp_enterprise) VALUES (?, ?, ?, ?, ?)')
    .run(row.slug, row.name, row.country ?? null, row.website ?? null, row.snmpEnterprise ?? null)
  return Number(res.lastInsertRowid)
}

export function manufacturerId(db: SqliteDriver, slug: string): number | undefined {
  const row = db.prepare('SELECT id FROM manufacturer WHERE slug = ?').get(slug)
  return row ? Number(row.id) : undefined
}

// ── Categorías (jerárquicas por parent_id) ─────────────────────────────

export function upsertCategory(db: SqliteDriver, row: CategoryRow): number {
  const existing = db.prepare('SELECT id FROM category WHERE code = ?').get(row.code)
  if (existing) return Number(existing.id)
  let parentId: number | null = null
  if (row.parentCode) {
    parentId = categoryId(db, row.parentCode) ?? null
  }
  const res = db
    .prepare(
      `INSERT INTO category (code, parent_id, name_es, aliases_json, sort_order, osi_profile_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(row.code, parentId, row.nameEs, JSON.stringify(row.aliases), row.sortOrder ?? 0, row.osiProfileJson ?? null)
  return Number(res.lastInsertRowid)
}

export function categoryId(db: SqliteDriver, code: string): number | undefined {
  const row = db.prepare('SELECT id FROM category WHERE code = ?').get(code)
  return row ? Number(row.id) : undefined
}

// ── Fuentes ────────────────────────────────────────────────────────────

export function upsertSource(db: SqliteDriver, row: SourceRow): number {
  const existing = db.prepare('SELECT id FROM source WHERE slug = ?').get(row.slug)
  if (existing) return Number(existing.id)
  const res = db
    .prepare(
      `INSERT INTO source (slug, kind, publisher, title, url, retrieved_on, authority_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.slug, row.kind, row.publisher ?? null, row.title, row.url ?? null, row.retrievedOn ?? null, row.authorityLevel)
  return Number(res.lastInsertRowid)
}

export function sourceId(db: SqliteDriver, slug: string): number | undefined {
  const row = db.prepare('SELECT id FROM source WHERE slug = ?').get(slug)
  return row ? Number(row.id) : undefined
}

// ── Catálogos auxiliares (protocolos, estándares, medios, capas) ───────

/** Inserta si falta y devuelve el id del protocolo (catálogo abierto de datos). */
export function protocolId(db: SqliteDriver, code: string, name?: string, family = 'internet', osiLayer = 3): number {
  const existing = db.prepare('SELECT id FROM protocol WHERE code = ?').get(code)
  if (existing) return Number(existing.id)
  const res = db.prepare('INSERT INTO protocol (code, name, family, osi_layer) VALUES (?, ?, ?, ?)').run(code, name ?? code, family, osiLayer)
  return Number(res.lastInsertRowid)
}

/** Inserta si falta y devuelve el id del estándar ("ieee/802.3at" → org, identifier). */
export function standardId(db: SqliteDriver, ref: string, title?: string): number {
  const [org, identifier] = ref.split('/')
  if (!org || !identifier) throw new Error(`Ref de estándar inválida: "${ref}" (formato org/identifier).`)
  const existing = db.prepare('SELECT id FROM standard WHERE org = ? AND identifier = ?').get(org, identifier)
  if (existing) return Number(existing.id)
  const res = db.prepare('INSERT INTO standard (org, identifier, title) VALUES (?, ?, ?)').run(org, identifier, title ?? ref)
  return Number(res.lastInsertRowid)
}

/** Inserta si falta y devuelve el id del medio de transmisión. */
export function mediumId(db: SqliteDriver, code: string, kind: 'cobre' | 'fibra' | 'inalambrico' | 'coaxial', name?: string): number {
  const existing = db.prepare('SELECT id FROM medium WHERE code = ?').get(code)
  if (existing) return Number(existing.id)
  const res = db.prepare('INSERT INTO medium (code, kind, name) VALUES (?, ?, ?)').run(code, kind, name ?? code)
  return Number(res.lastInsertRowid)
}

/** Añade una capa OSI / TCP-IP (catálogo semilla). */
export function seedLayer(db: SqliteDriver, number: number, nameEs: string, nameEn: string, table: 'osi_layer' | 'tcpip_layer'): void {
  db.prepare(`INSERT OR IGNORE INTO ${table} (number, name_es, name_en) VALUES (?, ?, ?)`).run(number, nameEs, nameEn)
}

/** Id de una capa por su número (tabla osi_layer). */
export function seedLayerId(db: SqliteDriver, number: string): number | undefined {
  const row = db.prepare('SELECT number FROM osi_layer WHERE number = ?').get(Number(number))
  return row ? Number(row.number) : undefined
}
