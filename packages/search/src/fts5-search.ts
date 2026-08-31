import type { SqliteDriver, SqlRow } from '@netatlas/data'
import type {
  SearchIndex,
  SearchRequest,
  SearchResponse,
  SearchHit,
  SearchFacets,
  FacetValue,
  SuggestResult,
} from '@netatlas/domain'
import type { Speed } from '@netatlas/domain'

/**
 * Adaptador FTS5 del puerto SearchIndex (sección 12 del plan maestro).
 * Fase 0: búsqueda textual FTS5 + facetas dinámicas agregadas; el compilador
 * DSL→SQL llega en NET-HW-013 (F1). Toda consulta usa parámetros, nunca
 * concatenación (sección 22.2).
 */
export class Fts5SearchIndex implements SearchIndex {
  constructor(private readonly db: SqliteDriver) {}

  async query(request: SearchRequest): Promise<SearchResponse> {
    const { rawQuery, limit, facetFilters } = request
    const offset = request.offset ?? 0

    // Sanitiza la consulta FTS5: filtramos operadores de sintaxis y escapamos comillas.
    const terms = rawQuery
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/"/g, '""'))
    const match = terms.length > 0 ? terms.map((t) => `"${t}"*`).join(' AND ') : ''

    const filters = buildFacetFilters(facetFilters)

    const hasMatch = match.length > 0
    const where = [hasMatch ? 'fts_device MATCH ?' : '1', ...filters.where].join(' AND ')
    const args: (string | number)[] = hasMatch ? [match] : []

    const countRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM fts_device
         JOIN device d ON d.id = fts_device.rowid
         ${filters.join}
         WHERE ${where}`,
      )
      .get(...args, ...filters.params)

    const total = Number(countRow?.total ?? 0)

    const hitRows = this.db
      .prepare(
        `SELECT d.id, d.slug, d.name, d.commercial_name,
                (SELECT group_concat(name_es, ' ') FROM category WHERE id = d.category_id) AS cat,
                bm25(fts_device) AS score
         FROM fts_device
         JOIN device d ON d.id = fts_device.rowid
         ${filters.join}
         WHERE ${where}
         ORDER BY bm25(fts_device)
         LIMIT ? OFFSET ?`,
      )
      .all(...args, ...filters.params, limit, offset)

    const hits: SearchHit[] = hitRows.map((r) => ({
      entityType: 'device',
      slug: String(r.slug),
      name: String(r.name ?? r.commercial_name ?? ''),
      score: Number(r.score),
    }))

    return {
      hits,
      total,
      facets: await this.facets(facetFilters),
    }
  }

  async facets(filters?: Record<string, string[]> | undefined): Promise<SearchFacets> {
    const f = buildFacetFilters(filters)
    const base = f.where.length > 0 ? `WHERE ${f.where.join(' AND ')}` : ''

    const facet = (sql: string): FacetValue[] =>
      this.db.prepare(sql).all(...f.params).map((r: SqlRow) => ({
        value: String(r.value),
        count: Number(r.count),
      }))

    return {
      category: facet(
        `SELECT c.name_es AS value, COUNT(*) AS count
         FROM device d
         JOIN category c ON c.id = d.category_id
         ${f.join}
         ${base} GROUP BY c.id ORDER BY count DESC`,
      ),
      lifecycleStatus: facet(
        `SELECT d.lifecycle_status AS value, COUNT(*) AS count
         FROM device d
         ${f.join}
         ${base} GROUP BY d.lifecycle_status ORDER BY count DESC`,
      ),
      manufacturer: facet(
        `SELECT m.slug AS value, COUNT(*) AS count
         FROM device d
         JOIN manufacturer m ON m.id = d.manufacturer_id
         ${base} GROUP BY m.slug ORDER BY count DESC`,
      ),
    }
  }

  async suggest(prefix: string, limit: number): Promise<readonly SuggestResult[]> {
    const term = prefix.trim().toLowerCase().replace(/"/g, '""')
    if (term.length === 0) return []
    const rows = this.db
      .prepare(
        `SELECT d.slug, d.name, d.commercial_name, bm25(fts_device) AS score
         FROM fts_device JOIN device d ON d.id = fts_device.rowid
         WHERE fts_device MATCH ?
         ORDER BY bm25(fts_device)
         LIMIT ?`,
      )
      .all(`"${term}"*`, limit)
    return rows.map((r) => ({
      entityType: 'device' as const,
      slug: String(r.slug),
      label: String(r.name ?? r.commercial_name ?? ''),
    }))
  }

  /** "interfaces de red de 10 Gbps": filtra dispositivos cuya velocidad máx. ≥ objetivo. */
  async byMaxSpeed(minSpeed: Speed, request: SearchRequest): Promise<SearchResponse> {
    const rows = this.db
      .prepare(
        `SELECT d.id, d.slug, d.name, d.commercial_name,
                MAX(CAST(je.value AS INTEGER)) AS max_speed
         FROM device d
         JOIN port p ON p.device_id = d.id
         JOIN json_each(p.speeds_json) AS je
         GROUP BY d.id
         HAVING MAX(CAST(je.value AS INTEGER)) >= ?
         ORDER BY max_speed DESC
         LIMIT ?`,
      )
      .all(minSpeed.toMbps(), request.limit)

    const hits: SearchHit[] = rows.map((r) => ({
      entityType: 'device',
      slug: String(r.slug),
      name: String(r.name ?? r.commercial_name ?? ''),
      score: Number(r.max_speed ?? 0),
    }))
    return { hits, total: hits.length, facets: { category: [], lifecycleStatus: [], manufacturer: [] } }
  }
}

interface BuiltFilters {
  /** Fragmento JOIN añadido a la consulta principal (device). */
  join: string
  where: string[]
  params: (string | number)[]
}

function buildFacetFilters(filters?: Record<string, string[]> | undefined): BuiltFilters {
  const where: string[] = []
  const params: (string | number)[] = []
  let join = ''

  if (!filters) return { join, where, params }

  const byKey: Record<string, (value: string) => void> = {
    category: (value) => {
      join = `JOIN category c ON c.id = d.category_id`
      where.push('c.code = ?')
      params.push(value)
    },
    lifecycleStatus: (value) => {
      where.push('d.lifecycle_status = ?')
      params.push(value)
    },
    manufacturer: (value) => {
      join = `JOIN manufacturer m ON m.id = d.manufacturer_id`
      where.push('m.slug = ?')
      params.push(value)
    },
  }

  for (const [key, values] of Object.entries(filters)) {
    const apply = byKey[key]
    if (!apply) continue
    for (const value of values) apply(value)
  }
  return { join, where, params }
}