import type { SqliteDriver } from '../driver.js'

/**
 * DAO de catálogo básico para la Fase 0: siembra y consulta de entidades núcleo.
 * Uso: dataset seed (20 fichas piloto) y tools/datagen (10k sintéticos).
 * En F1 se completa con los repositorios que implementan los puertos del dominio.
 */

export interface ManufacturerRow {
  readonly slug: string
  readonly name: string
  readonly country?: string
  readonly website?: string
  readonly snmpEnterprise?: number
}

export interface CategoryRow {
  readonly code: string
  readonly parentCode?: string
  readonly nameEs: string
  readonly aliases: readonly string[]
  readonly sortOrder?: number
  readonly osiProfileJson?: string
}

export interface DeviceRow {
  readonly slug: string
  readonly name: string
  readonly manufacturerSlug: string
  readonly categoryCode: string
  readonly lifecycleStatus: string
  readonly osiProfileJson?: string
  readonly summary?: string
  readonly model?: string
  readonly sku?: string
}

export interface PortRow {
  readonly deviceSlug: string
  readonly interfaceCode: string
  readonly label: string
  readonly quantity: number
  readonly speedsMbps: readonly number[]
  readonly poeStandard?: string
  readonly role?: string
}

export interface SourceRow {
  readonly slug: string
  readonly kind: string
  readonly publisher?: string
  readonly title: string
  readonly url?: string
  readonly retrievedOn?: string
  readonly authorityLevel: number
}

export interface AssertionRow {
  readonly subjectType: string
  readonly subjectId: number
  readonly predicate: string
  readonly valueJson: string
  readonly sourceSlug: string
  readonly confidence: string
  readonly verifiedOn: string
  readonly author: string
  readonly reviewedBy?: string
}

export interface RelationshipRow {
  readonly subjectType: string
  readonly subjectId: number
  readonly predicate: string
  readonly objectType: string
  readonly objectId: number
  readonly validFrom?: string
  readonly assertionId?: number
}

/** Resuelve el id interno de una entidad por (tipo, slug) — helpers del DAO. */
export class CatalogDao {
  constructor(private readonly db: SqliteDriver) {}

  // ── Fabricantes ────────────────────────────────────────────────
  upsertManufacturer(row: ManufacturerRow): number {
    const existing = this.db
      .prepare('SELECT id FROM manufacturer WHERE slug = ?')
      .get(row.slug)
    if (existing) return Number(existing.id)
    const res = this.db
      .prepare(
        'INSERT INTO manufacturer (slug, name, country, website, snmp_enterprise) VALUES (?, ?, ?, ?, ?)',
      )
      .run(row.slug, row.name, row.country ?? null, row.website ?? null, row.snmpEnterprise ?? null)
    return Number(res.lastInsertRowid)
  }

  manufacturerId(slug: string): number | undefined {
    const row = this.db.prepare('SELECT id FROM manufacturer WHERE slug = ?').get(slug)
    return row ? Number(row.id) : undefined
  }

  // ── Categorías (jerárquicas por parent_id) ─────────────────────
  upsertCategory(row: CategoryRow): number {
    const existing = this.db.prepare('SELECT id FROM category WHERE code = ?').get(row.code)
    if (existing) return Number(existing.id)
    let parentId: number | null = null
    if (row.parentCode) {
      parentId = this.categoryId(row.parentCode) ?? null
    }
    const res = this.db
      .prepare(
        `INSERT INTO category (code, parent_id, name_es, aliases_json, sort_order, osi_profile_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.code,
        parentId,
        row.nameEs,
        JSON.stringify(row.aliases),
        row.sortOrder ?? 0,
        row.osiProfileJson ?? null,
      )
    return Number(res.lastInsertRowid)
  }

  categoryId(code: string): number | undefined {
    const row = this.db.prepare('SELECT id FROM category WHERE code = ?').get(code)
    return row ? Number(row.id) : undefined
  }

  // ── Dispositivos ───────────────────────────────────────────────
  upsertDevice(row: DeviceRow): number {
    const manufacturerId = this.manufacturerId(row.manufacturerSlug)
    if (manufacturerId === undefined) {
      throw new Error(`Device "${row.slug}": fabricante desconocido "${row.manufacturerSlug}".`)
    }
    const categoryId = this.categoryId(row.categoryCode)
    if (categoryId === undefined) {
      throw new Error(`Device "${row.slug}": categoría desconocida "${row.categoryCode}".`)
    }
    const existing = this.db.prepare('SELECT id FROM device WHERE slug = ?').get(row.slug) as { id: number } | undefined
    if (existing) {
      // Actualización (delta/importación): refresca los campos esenciales del catálogo.
      this.db
        .prepare(
          `UPDATE device SET name = ?, manufacturer_id = ?, category_id = ?, lifecycle_status = ?,
                   osi_profile_json = ?, summary = ?, model = ?, sku = ?, updated_at = ? WHERE id = ?`,
        )
        .run(row.name, manufacturerId, categoryId, row.lifecycleStatus, row.osiProfileJson ?? null, row.summary ?? null, row.model ?? null, row.sku ?? null, new Date().toISOString(), Number(existing.id))
      return Number(existing.id)
    }
    const now = new Date().toISOString()
    const res = this.db
      .prepare(
        `INSERT INTO device (slug, name, manufacturer_id, category_id, lifecycle_status,
                             osi_profile_json, summary, model, sku, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.slug,
        row.name,
        manufacturerId,
        categoryId,
        row.lifecycleStatus,
        row.osiProfileJson ?? null,
        row.summary ?? null,
        row.model ?? null,
        row.sku ?? null,
        now,
        now,
      )
    return Number(res.lastInsertRowid)
  }

  deviceId(slug: string): number | undefined {
    const row = this.db.prepare('SELECT id FROM device WHERE slug = ?').get(slug)
    return row ? Number(row.id) : undefined
  }

  /** Borra un dispositivo con todo su rastro (puertos, atributos, relaciones, assertions). */
  eliminarDeviceCompleto(slug: string): boolean {
    const id = this.deviceId(slug)
    if (id === undefined) return false
    // Sin transacción propia: el caller (applyDelta/lote) aporta atomicidad.
    this.db.prepare("DELETE FROM assertion WHERE subject_type = 'device' AND subject_id = ?").run(id)
    this.db
      .prepare("DELETE FROM relationship WHERE (subject_type = 'device' AND subject_id = ?) OR (object_type = 'device' AND object_id = ?)")
      .run(id, id)
    // Puertos/atributos/roles usan ON DELETE CASCADE; device lo confirma.
    this.db.prepare('DELETE FROM device WHERE id = ?').run(id)
    return true
  }

  /** Convierte una lista de dispositivos en masa (p. ej. sintéticos). */
  bulkInsertDevices(rows: readonly DeviceRow[]): void {
    this.db.transaction(() => {
      for (const row of rows) this.upsertDevice(row)
    })
  }

  // ── Puertos ────────────────────────────────────────────────────
  /** Elimina todos los puertos de un dispositivo (reemplazo idempotente de inventario). */
  clearPorts(deviceSlug: string): void {
    const deviceId = this.deviceId(deviceSlug)
    if (deviceId === undefined) throw new Error(`clearPorts: dispositivo desconocido "${deviceSlug}".`)
    this.db.prepare('DELETE FROM port WHERE device_id = ?').run(deviceId)
  }

  addPort(row: PortRow): void {
    const deviceId = this.deviceId(row.deviceSlug)
    if (deviceId === undefined) throw new Error(`addPort: dispositivo desconocido "${row.deviceSlug}".`)
    let interfaceId = this.db
      .prepare('SELECT id FROM interface WHERE code = ?')
      .get(row.interfaceCode) as { id: number } | undefined
    if (!interfaceId) {
      const res = this.db
        .prepare('INSERT INTO interface (code, kind) VALUES (?, ?)')
        .run(row.interfaceCode, row.interfaceCode.startsWith('sfp') || row.interfaceCode.includes('10g') ? 'fibra' : 'ethernet')
      interfaceId = { id: Number(res.lastInsertRowid) }
    }
    this.db
      .prepare(
        `INSERT INTO port (device_id, interface_id, label, quantity, speeds_json, poe_standard, role)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        deviceId,
        interfaceId.id,
        row.label,
        row.quantity,
        JSON.stringify(row.speedsMbps),
        row.poeStandard ?? null,
        row.role ?? null,
      )
  }

  // ── Fuentes y afirmaciones ─────────────────────────────────────
  upsertSource(row: SourceRow): number {
    const existing = this.db.prepare('SELECT id FROM source WHERE slug = ?').get(row.slug)
    if (existing) return Number(existing.id)
    const res = this.db
      .prepare(
        `INSERT INTO source (slug, kind, publisher, title, url, retrieved_on, authority_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.slug, row.kind, row.publisher ?? null, row.title, row.url ?? null, row.retrievedOn ?? null, row.authorityLevel)
    return Number(res.lastInsertRowid)
  }

  sourceId(slug: string): number | undefined {
    const row = this.db.prepare('SELECT id FROM source WHERE slug = ?').get(slug)
    return row ? Number(row.id) : undefined
  }

  addAssertion(row: AssertionRow): number {
    const sourceId = this.sourceId(row.sourceSlug)
    if (sourceId === undefined) {
      throw new Error(`addAssertion: fuente desconocida "${row.sourceSlug}".`)
    }
    const res = this.db
      .prepare(
        `INSERT INTO assertion (subject_type, subject_id, predicate, value_json,
                                source_id, confidence, verified_on, author, reviewed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.subjectType,
        row.subjectId,
        row.predicate,
        row.valueJson,
        sourceId,
        row.confidence,
        row.verifiedOn,
        row.author,
        row.reviewedBy ?? null,
      )
    return Number(res.lastInsertRowid)
  }

  // ── Predicados y aristas ───────────────────────────────────────
  seedPredicates(rows: readonly { code: string; domain: readonly string[]; range: readonly string[]; cardinality?: string; symmetric?: boolean; acyclic?: boolean; inverse?: string }[]): void {
    this.db.transaction(() => {
      for (const row of rows) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO predicate (code, domain_types, range_types, cardinality, symmetric, acyclic, inverse_code)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            row.code,
            JSON.stringify(row.domain),
            JSON.stringify(row.range),
            row.cardinality ?? 'many',
            row.symmetric ? 1 : 0,
            row.acyclic ? 1 : 0,
            row.inverse ?? null,
          )
      }
    })
  }

  /** Refs "org/identifier" de implements-standard ya curados de un dispositivo. */
  existingStandardRefs(deviceId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT s.org || '/' || s.identifier AS ref
         FROM relationship r
         JOIN standard s ON s.id = r.object_id AND r.object_type = 'standard'
         WHERE r.subject_type = 'device' AND r.subject_id = ?
           AND r.predicate = 'implements-standard'`,
      )
      .all(deviceId) as { ref: string }[]
    return rows.map((r) => String(r.ref))
  }

  /** Inserta un datasheet de dispositivo (resuelve device + fuente). */
  addDatasheet(row: {
    readonly deviceSlug: string
    readonly title: string
    readonly language?: string
    readonly url?: string
    readonly localPath?: string
    readonly sourceSlug: string
  }): number {
    const deviceId = this.deviceId(row.deviceSlug)
    if (deviceId === undefined) throw new Error(`addDatasheet: dispositivo desconocido "${row.deviceSlug}".`)
    const sourceId = this.sourceId(row.sourceSlug)
    if (sourceId === undefined) throw new Error(`addDatasheet: fuente desconocida "${row.sourceSlug}".`)
    const res = this.db
      .prepare(
        `INSERT INTO datasheet (device_id, title, language, source_id, local_path, url)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(deviceId, row.title, row.language ?? 'es', sourceId, row.localPath ?? null, row.url ?? null)
    return Number(res.lastInsertRowid)
  }

  addRelationship(row: RelationshipRow): void {
    this.db
      .prepare(
        `INSERT INTO relationship (subject_type, subject_id, predicate, object_type, object_id,
                                   weight, assertion_id, valid_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.subjectType,
        row.subjectId,
        row.predicate,
        row.objectType,
        row.objectId,
        null,
        row.assertionId ?? null,
        row.validFrom ?? '1970-01-01',
        new Date().toISOString(),
      )
  }

  // ── Catálogos auxiliares (protocolos, estándares, medios, capas) ──

  /** Inserta si falta y devuelve el id del protocolo (catálogo abierto de datos). */
  protocolId(code: string, name?: string, family = 'internet', osiLayer = 3): number {
    const existing = this.db.prepare('SELECT id FROM protocol WHERE code = ?').get(code)
    if (existing) return Number(existing.id)
    const res = this.db
      .prepare('INSERT INTO protocol (code, name, family, osi_layer) VALUES (?, ?, ?, ?)')
      .run(code, name ?? code, family, osiLayer)
    return Number(res.lastInsertRowid)
  }

  /** Inserta si falta y devuelve el id del estándar ("ieee/802.3at" → org, identifier). */
  standardId(ref: string, title?: string): number {
    const [org, identifier] = ref.split('/')
    if (!org || !identifier) throw new Error(`Ref de estándar inválida: "${ref}" (formato org/identifier).`)
    const existing = this.db
      .prepare('SELECT id FROM standard WHERE org = ? AND identifier = ?')
      .get(org, identifier)
    if (existing) return Number(existing.id)
    const res = this.db
      .prepare('INSERT INTO standard (org, identifier, title) VALUES (?, ?, ?)')
      .run(org, identifier, title ?? ref)
    return Number(res.lastInsertRowid)
  }

  /** Inserta si falta y devuelve el id del medio de transmisión. */
  mediumId(code: string, kind: 'cobre' | 'fibra' | 'inalambrico' | 'coaxial', name?: string): number {
    const existing = this.db.prepare('SELECT id FROM medium WHERE code = ?').get(code)
    if (existing) return Number(existing.id)
    const res = this.db
      .prepare('INSERT INTO medium (code, kind, name) VALUES (?, ?, ?)')
      .run(code, kind, name ?? code)
    return Number(res.lastInsertRowid)
  }

  /** Añade una capa OSI / TCP-IP (catálogo semilla). */
  seedLayer(number: number, nameEs: string, nameEn: string, table: 'osi_layer' | 'tcpip_layer'): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO ${table} (number, name_es, name_en) VALUES (?, ?, ?)`)
      .run(number, nameEs, nameEn)
  }

  /** Id de una capa por su número (tabla osi_layer). */
  seedLayerId(number: string): number | undefined {
    const row = this.db.prepare('SELECT number FROM osi_layer WHERE number = ?').get(Number(number))
    return row ? Number(row.number) : undefined
  }

  // ── EAV: attribute_definition / device_attribute (§9.4) ─────────────────

  /** Define un atributo de categoría (idempotente por (category, key)). */
  defineAttribute(def: {
    readonly categoryCode: string
    readonly key: string
    readonly labelEs: string
    readonly valueType: 'number' | 'text' | 'enum' | 'bool' | 'range'
    readonly unit?: string
    readonly enumValues?: readonly string[]
    readonly isFacet?: boolean
    readonly isComparable?: boolean
    readonly compareRule?: 'higher-better' | 'lower-better' | 'set-compare' | 'none'
  }): number {
    const categoryId = this.categoryId(def.categoryCode)
    if (categoryId === undefined) throw new Error(`defineAttribute: categoría "${def.categoryCode}" inexistente.`)
    const existing = this.db
      .prepare('SELECT id FROM attribute_definition WHERE category_id = ? AND key = ?')
      .get(categoryId, def.key)
    if (existing) return Number(existing.id)
    const res = this.db
      .prepare(
        `INSERT INTO attribute_definition
           (category_id, key, label_es, value_type, unit, enum_json, is_facet, is_comparable, compare_rule, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        categoryId,
        def.key,
        def.labelEs,
        def.valueType,
        def.unit ?? null,
        def.enumValues ? JSON.stringify(def.enumValues) : null,
        def.isFacet ? 1 : 0,
        def.isComparable ?? true ? 1 : 0,
        def.compareRule ?? 'none',
      )
    return Number(res.lastInsertRowid)
  }

  /** Asigna (o reemplaza) el valor de un atributo a un dispositivo. */
  setDeviceAttribute(
    deviceSlug: string,
    attributeKey: string,
    value: number | string | boolean | null,
    assertionId?: number,
  ): void {
    const deviceId = this.deviceId(deviceSlug)
    if (deviceId === undefined) throw new Error(`setDeviceAttribute: dispositivo "${deviceSlug}" inexistente.`)
    const attr = this.db
      .prepare(
        `SELECT ad.id, ad.value_type FROM attribute_definition ad
         JOIN category c ON c.id = ad.category_id
         JOIN device d ON d.id = ? AND (c.id = d.category_id OR c.id IN (
           WITH RECURSIVE anc(cat_id) AS (
             SELECT d.category_id
             UNION ALL
             SELECT c2.parent_id FROM category c2 JOIN anc a ON c2.id = a.cat_id
           )
           SELECT cat_id FROM anc WHERE cat_id IS NOT NULL
         ))
         WHERE ad.key = ?`,
      )
      .get(deviceId, attributeKey) as { id: number; value_type: string } | undefined
    if (!attr) return // atributo no definido para la categoría → se ignora

    const valueNumber = attr.value_type === 'number' || attr.value_type === 'range' ? (typeof value === 'number' ? value : null) : null
    const valueText = typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? '1' : '0') : null
    const valueBool = typeof value === 'boolean' ? (value ? 1 : 0) : attr.value_type === 'bool' && typeof value === 'number' ? (value !== 0 ? 1 : 0) : null

    this.db
      .prepare(
        `INSERT INTO device_attribute (device_id, attribute_id, value_number, value_text, value_bool, assertion_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id, attribute_id) DO UPDATE SET
           value_number = excluded.value_number,
           value_text = excluded.value_text,
           value_bool = excluded.value_bool,
           assertion_id = COALESCE(excluded.assertion_id, device_attribute.assertion_id)`,
      )
      .run(deviceId, attr.id, valueNumber, valueText, valueBool, assertionId ?? null)
  }
}