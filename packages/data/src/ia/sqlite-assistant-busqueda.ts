import type { SqliteDriver } from '../driver.js'
import { SqliteCatalogRepository } from '../repositories/device-repository.js'
import type { SearchIndex } from '@netatlas/domain'
import { deviceCategory } from './sqlite-assistant-helpers.js'

/**
 * `searchCatalog` del asistente: muestra del catálogo sin consulta, o el
 * índice inyectado (FTS5 de @netatlas/search, wa-sqlite, …) para DSL/texto
 * libre — mismo contrato que la UI; el score es opaco.
 */
export async function buscarEnCatalogo(
  db: SqliteDriver,
  search: SearchIndex,
  dsl: string,
  limit: number,
): Promise<readonly { slug: string; nombre: string; categoria: string }[]> {
  const cats = await new SqliteCatalogRepository(db).listCategories()
  const nombresCat = new Map(cats.map((c) => [c.code, c.nameEs]))
  const raw = dsl.trim()
  if (raw.length === 0) {
    // Sin consulta estructurada: muestra del catálogo (devuelve pocos para
    // que el asistente no inunde la respuesta; busca específica si hace falta).
    const row = db
      .prepare(
        `SELECT d.slug, d.name, c.code AS cat
         FROM device d JOIN category c ON c.id = d.category_id
         ORDER BY c.code, d.name LIMIT ?`,
      )
      .all(limit) as { slug: string; name: string; cat: string }[]
    return row.map((r) => ({ slug: r.slug, nombre: r.name, categoria: nombresCat.get(r.cat) ?? 'Dispositivo' }))
  }
  const res = await search.query({ rawQuery: raw, limit })
  return res.hits.map((h) => ({
    slug: h.slug,
    nombre: h.name,
    categoria: nombresCat.get(deviceCategory(db, h.slug)) ?? 'Dispositivo',
  }))
}
