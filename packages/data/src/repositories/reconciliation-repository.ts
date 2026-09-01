import type { SqliteDriver, SqlRow } from '../driver.js'

/**
 * Cola de reconciliación con diff (NET-HW-045, §19.2-4).
 * El pipeline de importación deja aquí los candidatos cuyo dedup score cae en
 * [0.7, 0.98) — nunca se fusionan sin revisión humana. El revisor acepta o
 * rechaza desde el dashboard de calidad (NET-HW-049).
 */

export interface DiffField {
  readonly campo: string
  readonly entrante: string
  readonly existente: string
}

export type ReconciliationStatus = 'pending' | 'accepted' | 'rejected'

export interface ReconciliationRow {
  readonly id: number
  readonly entradaSlug: string
  readonly existenteSlug: string
  readonly score: number
  readonly diff: readonly DiffField[]
  readonly status: ReconciliationStatus
  readonly author?: string | undefined
  readonly createdAt: string
  readonly resolvedAt?: string | undefined
}

export class SqliteReconciliationRepository {
  constructor(private readonly db: SqliteDriver) {}

  async pendientes(): Promise<readonly ReconciliationRow[]> {
    const rows = this.db.prepare('SELECT * FROM reconciliation ORDER BY created_at DESC').all() as SqlRow[]
    return rows.map((r) => ({
      id: Number(r.id),
      entradaSlug: String(r.entrada_slug),
      existenteSlug: String(r.existente_slug),
      score: Number(r.score),
      diff: JSON.parse(String(r.diff_json)) as DiffField[],
      status: String(r.status) as ReconciliationStatus,
      author: r.author !== null ? String(r.author) : undefined,
      createdAt: String(r.created_at),
      resolvedAt: r.resolved_at !== null ? String(r.resolved_at) : undefined,
    }))
  }

  async contarPendientes(): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM reconciliation WHERE status = 'pending'").get() as { c: number } | undefined
    return Number(row?.c ?? 0)
  }

  async crear(entrada: { entradaSlug: string; existenteSlug: string; score: number; diff: readonly DiffField[] }): Promise<number> {
    const res = this.db
      .prepare(
        `INSERT INTO reconciliation (entrada_slug, existente_slug, score, diff_json, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .run(entrada.entradaSlug, entrada.existenteSlug, entrada.score, JSON.stringify(entrada.diff), new Date().toISOString())
    return Number(res.lastInsertRowid)
  }

  /** Acción del revisor: aceptar (funde el entrante en el existente) o rechazar. */
  async resolver(id: number, decision: 'accepted' | 'rejected', author: string): Promise<void> {
    this.db
      .prepare('UPDATE reconciliation SET status = ?, author = ?, resolved_at = ? WHERE id = ?')
      .run(decision, author, new Date().toISOString(), id)
  }
}