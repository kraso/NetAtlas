import type { SqliteDriver, SqlRow } from '../driver.js'
import { Assertion, Datasheet, DeviceImage, Source, isConfidence } from '@netatlas/domain'
import type { AuthorityLevel, Confidence, ImageKind, SourceKind, SourcingRepository } from '@netatlas/domain'

/**
 * Adaptador SQLite de SourcingRepository (sección 20).
 * Expone assertions con su fuente (join) — alimenta la pestaña Referencias
 * de la ficha: cada dato crítico con su fuente, confianza y revisor.
 *
 * Nota sobre `SourceRow` (daos/catalog-dao.ts): es el contrato de ESCRITURA de
 * `upsertSource`, no el de lectura. No se reutiliza a propósito — declara
 * `kind: string` y acá hace falta el union del dominio (`SourceKind`).
 */

/**
 * Columna opcional → string | undefined.
 * `SqlRow` usa índice abierto ([column: string]), así que con
 * noUncheckedIndexedAccess una columna ausente llega como `undefined` y
 * `!== null` no la filtra: se colaría el string "undefined".
 */
function optString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value)
}

/**
 * Columna obligatoria → string. Falla fuerte si la columna no vino.
 * Es el espejo de `optString`: una columna requerida que falta no puede
 * degradarse en silencio al string "undefined" (que además pasaría la
 * validación de `Source.title`, porque no está vacío).
 */
function requiredString(value: unknown, column: string): string {
  if (value === null || value === undefined) {
    throw new Error(`sourcing-repository: falta la columna obligatoria "${column}".`)
  }
  return String(value)
}

/** Columna obligatoria numérica → number. Falla fuerte si no es finita. */
function requiredNumber(value: unknown, column: string): number {
  const raw = requiredString(value, column)
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    throw new Error(`sourcing-repository: la columna "${column}" no es numérica: "${raw}".`)
  }
  return n
}

/**
 * Columna obligatoria contra el vocabulario cerrado de confianza.
 * Antes una confianza ausente o inválida se reescribía en silencio como
 * 'derived' y llegaba así a la UI de Referencias como si fuera un dato real.
 */
function requiredConfidence(value: unknown, column: string): Confidence {
  const raw = requiredString(value, column)
  if (!isConfidence(raw)) {
    throw new Error(`sourcing-repository: la columna "${column}" no es una confianza válida: "${raw}".`)
  }
  return raw
}

/**
 * Mapea una fila con alias `source_*` (join contra la tabla source) al VO Source.
 * Estaba copiado en cuatro sitios con el union de kinds escrito inline cuatro
 * veces: agregar un kind obligaba a tocar cuatro lugares sin que el compilador
 * avisara.
 */
function mapSourceRow(r: SqlRow): Source {
  // `kind` y `authorityLevel` se afirman a nivel de tipo porque un string no se
  // puede angostar; el VO `Source` los valida en runtime (isSourceKind /
  // isAuthorityLevel), así que la afirmación no queda sin respaldo.
  return Source.create({
    slug: requiredString(r.source_slug, 'source_slug'),
    kind: String(r.source_kind) as SourceKind,
    publisher: optString(r.source_publisher),
    title: requiredString(r.source_title, 'source_title'),
    url: optString(r.source_url),
    publishedOn: optString(r.source_published),
    retrievedOn: optString(r.source_retrieved),
    authorityLevel: requiredNumber(r.source_authority, 'source_authority') as AuthorityLevel,
  })
}

/** Mapea una fila (join con source) al VO Assertion del dominio. */
function mapAssertionRow(r: SqlRow): Assertion {
  return Assertion.create({
    subjectType: requiredString(r.subject_type, 'subject_type'),
    subjectId: requiredNumber(r.subject_id, 'subject_id'),
    predicate: requiredString(r.predicate, 'predicate'),
    valueJson: requiredString(r.value_json, 'value_json'),
    source: mapSourceRow(r),
    confidence: requiredConfidence(r.confidence, 'confidence'),
    verifiedOn: requiredString(r.verified_on, 'verified_on'),
    author: requiredString(r.author, 'author'),
    reviewedBy: optString(r.reviewed_by),
    note: optString(r.note),
  })
}

export class SqliteSourcingRepository implements SourcingRepository {
  constructor(private readonly db: SqliteDriver) {}

  /** Afirmaciones de un dispositivo por slug (resuelve el id interno). */
  async assertionsForDevice(slug: string): Promise<readonly Assertion[]> {
    const row = this.db.prepare('SELECT id FROM device WHERE slug = ?').get(slug) as SqlRow | undefined
    if (!row) return []
    return this.assertionsFor('device', requiredNumber(row.id, 'id'))
  }

  async assertionsFor(subjectType: string, subjectId: number): Promise<readonly Assertion[]> {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.subject_type, a.subject_id, a.predicate, a.value_json,
                a.confidence, a.verified_on, a.author, a.reviewed_by, a.note,
                s.slug AS source_slug, s.kind AS source_kind,
                s.published_on AS source_published,
                s.publisher AS source_publisher, s.title AS source_title, s.url AS source_url,
                s.retrieved_on AS source_retrieved, s.authority_level AS source_authority
         FROM assertion a
         JOIN source s ON s.id = a.source_id
         WHERE a.subject_type = ? AND a.subject_id = ?
         ORDER BY a.predicate`,
      )
      .all(subjectType, subjectId) as SqlRow[]
    return rows.map((r) => mapAssertionRow(r))
  }

  /** Datasheets de un dispositivo por slug (join con fuente). */
  async datasheetsForDevice(deviceSlug: string): Promise<readonly Datasheet[]> {
    const rows = this.db
      .prepare(
        `SELECT f.title, f.language, f.url, f.local_path,
                s.slug AS source_slug, s.kind AS source_kind,
                s.published_on AS source_published,
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
        title: requiredString(r.title, 'title'),
        language: requiredString(r.language, 'language'),
        url: optString(r.url),
        localPath: optString(r.local_path),
        source: mapSourceRow(r),
      }),
    )
  }

  /** Imágenes del dispositivo (join con fuente). */
  async imagesForDevice(deviceSlug: string): Promise<readonly DeviceImage[]> {
    const rows = this.db
      .prepare(
        `SELECT g.kind, g.caption, g.local_path, g.url,
                s.slug AS source_slug, s.kind AS source_kind,
                s.published_on AS source_published,
                s.publisher AS source_publisher, s.title AS source_title, s.url AS source_url,
                s.retrieved_on AS source_retrieved, s.authority_level AS source_authority
         FROM image g
         JOIN device d ON d.id = g.device_id
         JOIN source s ON s.id = g.source_id
         WHERE d.slug = ?
         ORDER BY g.kind, g.caption`,
      )
      .all(deviceSlug) as SqlRow[]
    return rows.map((r) =>
      DeviceImage.create({
        deviceSlug,
        kind: requiredString(r.kind, 'kind') as ImageKind,
        caption: optString(r.caption),
        localPath: optString(r.local_path),
        url: optString(r.url),
        source: mapSourceRow(r),
      }),
    )
  }

  async sourceBySlug(slug: string): Promise<Source | undefined> {
    const row = this.db
      .prepare(
        `SELECT slug AS source_slug, kind AS source_kind, publisher AS source_publisher,
                published_on AS source_published, title AS source_title, url AS source_url,
                retrieved_on AS source_retrieved, authority_level AS source_authority
         FROM source WHERE slug = ?`,
      )
      .get(slug) as SqlRow | undefined
    if (!row) return undefined
    return mapSourceRow(row)
  }
}
