import type { SqliteDriver } from '../driver.js'
import type { GraphNode } from '@netatlas/domain'

/**
 * Resolución id numérico ↔ slug canónico por tipo de nodo (NET-HW-003 / §9.5).
 * La tabla `relationship` guarda ids INTEGER; cada tipo se resuelve contra su
 * tabla catálogo con la columna slug correspondiente.
 */

const RESOLVE_SQL: Record<string, { table: string; slugCol: string; idCol?: string }> = {
  device: { table: 'device', slugCol: 'slug' },
  manufacturer: { table: 'manufacturer', slugCol: 'slug' },
  'product-family': { table: 'product_family', slugCol: 'slug' },
  category: { table: 'category', slugCol: 'code' },
  interface: { table: 'interface', slugCol: 'code' },
  protocol: { table: 'protocol', slugCol: 'code' },
  // standard no tiene columna code: el slug canónico es "org/identifier"
  // (misma convención que suggestGrouped, StandardSheet y snapshotDetail).
  standard: { table: 'standard', slugCol: "org || '/' || identifier" },
  technology: { table: 'technology', slugCol: 'slug' },
  medium: { table: 'medium', slugCol: 'code' },
  component: { table: 'component', slugCol: 'model' },
  layer: { table: 'osi_layer', slugCol: 'number', idCol: 'number' },
  firmware: { table: 'firmware', slugCol: 'version', idCol: 'id' },
  topology: { table: 'topology', slugCol: 'slug' },
  'speed-grade': { table: 'speed_grade', slugCol: 'code' },
}

/** Consultas de resolución sobre las tablas catálogo (una por operación). */
export class SqlSlugResolver {
  constructor(private readonly db: SqliteDriver) {}

  /** Id INTEGER de un nodo, o undefined si el tipo no existe en el catálogo. */
  idDe(node: GraphNode): number | undefined {
    const def = RESOLVE_SQL[node.type]
    if (!def) return undefined
    const row = this.db
      .prepare(`SELECT ${def.idCol ?? 'id'} AS id FROM ${def.table} WHERE ${def.slugCol} = ?`)
      .get(node.slug) as { id: number } | undefined
    return row ? Number(row.id) : undefined
  }

  /** Slug canónico de un id, o undefined si el tipo no existe en el catálogo. */
  slugDe(type: GraphNode['type'], id: number): string | undefined {
    const def = RESOLVE_SQL[type]
    if (!def) return undefined
    const row = this.db
      .prepare(`SELECT ${def.slugCol} AS slug FROM ${def.table} WHERE ${def.idCol ?? 'id'} = ?`)
      .get(id) as { slug: string | number } | undefined
    return row ? String(row.slug) : undefined
  }
}
