import type { SqliteDriver, SqlRow } from '../driver.js'
import { Assertion, Datasheet, Source, isConfidence } from '@netatlas/domain'
import type { Confidence, SourcingRepository } from '@netatlas/domain'

/**
 * Adaptador SQLite de SourcingRepository (sección 20).
 * Expone assertions con su fuente (join) — alimenta la pestaña Referencias
 * de la ficha: cada dato crítico con su fuente, confianza y revisor.
 */
export class SqliteSourcingRepository implements SourcingRepository {
  constructor(private readonly db: SqliteDriver) {}

  /** Afirmaciones de un dispositivo por slug (resuelve el id interno). */
  async assertionsForDevice(slug: string): Promise<readonly Assertion[]> {
    const row = this.db.prepare('SELECT id FROM device WHERE slug = ?').get(slug) as { id: number } | undefined
    if (!row) return []
    return this.assertionsFor('device', Number(row.id))
  }

  async assertionsFor(subjectType: string, subjectId: number): Promise<readonly Assertion[]> {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.subject_type, a.subject_id, a.predicate, a.value_json,
                a.confidence, a.verified_on, a.author, a.reviewed_by, a.note,
                s.id AS source_id, s.slug AS source_slug, s.kind AS source_kind,
                s.publisher AS source_publisher, s.title AS source_title, s.url AS source_url,
                s.retrieved_on AS source_retrieved, s.authority_level AS source_authority
         FROM assertion a
         JOIN source s ON s.id = a.source_id
         WHERE a.subject_type = ? AND a.subject_id = ?
         ORDER BY a.predicate`,
      )
      .all(subjectType, subjectId) as SqlRow[]
    return rows.map((r) => {
      const confRaw = String(r.confidence)
      const confidence: Confidence = isConfidence(confRaw) ? confRaw : 'derived'
      return Assertion.create({
        subjectType: String(r.subject_type),
        subjectId: Number(r.subject_id),
        predicate: String(r.predicate),
        valueJson: String(r.value_json),
        source: Source.create({
          slug: String(r.source_slug),
          kind: String(r.source_kind) as 'datasheet' | 'manual' | 'rfc' | 'ieee' | 'web-oficial' | 'libro' | 'terceros' | 'editorial',
          publisher: r.source_publisher !== null ? String(r.source_publisher) : undefined,
          title: String(r.source_title),
          url: r.source_url !== null ? String(r.source_url) : undefined,
          retrievedOn: r.source_retrieved !== null ? String(r.source_retrieved) : undefined,
          authorityLevel: Number(r.source_authority) as 1 | 2 | 3 | 4,
        }),
        confidence,
        verifiedOn: String(r.verified_on),
        author: String(r.author),
        reviewedBy: r.reviewed_by !== null ? String(r.reviewed_by) : undefined,
        note: r.note !== null ? String(r.note) : undefined,
      })
    })
  }

  /** Datasheets de un dispositivo por slug (join con fuente). */
  async datasheetsForDevice(deviceSlug: string): Promise<readonly Datasheet[]> {
    const rows = this.db
      .prepare(
        `SELECT f.title, f.language, f.url, f.local_path,
                s.id AS source_id, s.slug AS source_slug, s.kind AS source_kind,
                s.publisher AS source_publisher, s.title AS source_title, s.url AS source_url,
                s.retrieved_on AS source_retrieved, s.authority_level AS source_authority
         FROM datasheet f
         JOIN device d ON d.id = f.device_id
         JOIN source s ON s.id = f.source_id
         WHERE d.slug = ?
         ORDER BY f.title`,
      )
      .all(deviceSlug) as SqlRow[]
    return rows.map((r) =>
      Datasheet.create({
        deviceSlug,
        title: String(r.title),
        language: String(r.language),
        url: r.url !== null ? String(r.url) : undefined,
        localPath: r.local_path !== null ? String(r.local_path) : undefined,
        source: Source.create({
          slug: String(r.source_slug),
          kind: String(r.source_kind) as 'datasheet' | 'manual' | 'rfc' | 'ieee' | 'web-oficial' | 'libro' | 'terceros' | 'editorial',
          publisher: r.source_publisher !== null ? String(r.source_publisher) : undefined,
          title: String(r.source_title),
          url: r.source_url !== null ? String(r.source_url) : undefined,
          retrievedOn: r.source_retrieved !== null ? String(r.source_retrieved) : undefined,
          authorityLevel: Number(r.source_authority) as 1 | 2 | 3 | 4,
        }),
      }),
    )
  }

  async sourceBySlug(slug: string): Promise<Source | undefined> {
    const row = this.db
      .prepare(
        'SELECT slug, kind, publisher, title, url, retrieved_on, authority_level FROM source WHERE slug = ?',
      )
      .get(slug) as SqlRow | undefined
    if (!row) return undefined
    return Source.create({
      slug: String(row.slug),
      kind: String(row.kind) as 'datasheet' | 'manual' | 'rfc' | 'ieee' | 'web-oficial' | 'libro' | 'terceros' | 'editorial',
      publisher: row.publisher !== null ? String(row.publisher) : undefined,
      title: String(row.title),
      url: row.url !== null ? String(row.url) : undefined,
      retrievedOn: row.retrieved_on !== null ? String(row.retrieved_on) : undefined,
      authorityLevel: Number(row.authority_level) as 1 | 2 | 3 | 4,
    })
  }
}