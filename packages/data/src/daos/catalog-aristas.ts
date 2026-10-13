import type { SqliteDriver } from '../driver.js'
import { sourceId } from './catalog-maestros.js'
import type { AssertionRow, PredicateSeedRow, RelationshipRow } from './catalog-tipos.js'

/**
 * Assertions y aristas (grafo materializado): funciones libres sobre el
 * driver que `CatalogDao` delega sin cambiar su API.
 */

export function seedPredicates(db: SqliteDriver, rows: readonly PredicateSeedRow[]): void {
  db.transaction(() => {
    for (const row of rows) {
      db.prepare(
        `INSERT OR IGNORE INTO predicate (code, domain_types, range_types, cardinality, symmetric, acyclic, inverse_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(row.code, JSON.stringify(row.domain), JSON.stringify(row.range), row.cardinality ?? 'many', row.symmetric ? 1 : 0, row.acyclic ? 1 : 0, row.inverse ?? null)
    }
  })
}

export function addAssertion(db: SqliteDriver, row: AssertionRow): number {
  const srcId = sourceId(db, row.sourceSlug)
  if (srcId === undefined) {
    throw new Error(`addAssertion: fuente desconocida "${row.sourceSlug}".`)
  }
  const res = db
    .prepare(
      `INSERT INTO assertion (subject_type, subject_id, predicate, value_json,
                              source_id, confidence, verified_on, author, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.subjectType, row.subjectId, row.predicate, row.valueJson, srcId, row.confidence, row.verifiedOn, row.author, row.reviewedBy ?? null)
  return Number(res.lastInsertRowid)
}

/** Refs "org/identifier" de implements-standard ya curados de un dispositivo. */
export function existingStandardRefs(db: SqliteDriver, deviceId: number): string[] {
  const rows = db
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

export function addRelationship(db: SqliteDriver, row: RelationshipRow): void {
  db.prepare(
    `INSERT INTO relationship (subject_type, subject_id, predicate, object_type, object_id,
                               weight, assertion_id, valid_from, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.subjectType, row.subjectId, row.predicate, row.objectType, row.objectId, null, row.assertionId ?? null, row.validFrom ?? '1970-01-01', new Date().toISOString())
}
