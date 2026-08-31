import type { ConsultaDsl, DslTermino, ClaveDsl } from '@netatlas/domain'
import { PREDICATES } from '@netatlas/domain'
import type { SqlValue } from '@netatlas/data'

/**
 * Compilador AST → SQL parametrizado (NET-HW-013, F1).
 * Traduce el AST del DSL a condiciones SQL sobre el esquema canónico.
 * Nunca concatena entrada del usuario: toda condición usa parámetros (?).
 *
 * Semántica (§12.3):
 * - campo:valor sin '+' ⇒ OR por valor (cada valor es una condición EXISTS)
 * - '+campo:valor'   ⇒ AND (independiente)
 * - 'campo:a..b'     ⇒ rango numérico (BETWEEN o >=/<= según el campo)
 * - '-campo:valor'   ⇒ NOT EXISTS
 */

export interface CompiledWhere {
  readonly clause: string
  readonly params: readonly SqlValue[]
  readonly joins: readonly string[]
}

/** SQL para igualdad (1–3 placeholders) y para rango cuando el campo es numérico. */
interface BaseSql {
  sqlEq: string
  sqlRange?: string
}

function likeTerm(value: string): string {
  return `%${value}%`
}

function baseFor(clave: ClaveDsl): BaseSql {
  switch (clave) {
    case 'cat':
      // §12.3 Q6: hereda subcategorías por CTE de árbol; código completo o alias ('sw' → CAT-SWT).
      return {
        sqlEq: `EXISTS (
          WITH RECURSIVE raiz(cat_id) AS (
            SELECT id FROM category WHERE code = ? OR aliases_json LIKE ?
            UNION ALL
            SELECT c.id FROM category c JOIN raiz r ON c.parent_id = r.cat_id
          )
          SELECT 1 FROM raiz WHERE cat_id = d.category_id
        )`,
      }
    case 'fabricante':
      return { sqlEq: "EXISTS (SELECT 1 FROM manufacturer m2 WHERE m2.id = d.manufacturer_id AND m2.slug = ?)" }
    case 'puertos':
      return {
        sqlEq: "EXISTS (SELECT 1 FROM port p2 WHERE p2.device_id = d.id GROUP BY p2.device_id HAVING SUM(p2.quantity) >= ?)",
        sqlRange:
          "EXISTS (SELECT 1 FROM port pr2 WHERE pr2.device_id = d.id GROUP BY pr2.device_id HAVING SUM(pr2.quantity) BETWEEN ? AND ?)",
      }
    case 'velocidad':
      return {
        sqlEq:
          "EXISTS (SELECT 1 FROM port vp JOIN json_each(vp.speeds_json) vje ON 1=1 WHERE vp.device_id = d.id AND CAST(vje.value AS INTEGER) >= ?)",
        sqlRange:
          "EXISTS (SELECT 1 FROM port vpr JOIN json_each(vpr.speeds_json) vrje ON 1=1 WHERE vpr.device_id = d.id AND CAST(vrje.value AS INTEGER) >= ? AND CAST(vrje.value AS INTEGER) <= ?)",
      }
    case 'poe':
      return { sqlEq: "EXISTS (SELECT 1 FROM port p4 WHERE p4.device_id = d.id AND p4.poe_standard IS NOT NULL AND (? = '*' OR p4.poe_standard = ?))" }
    case 'protocolo':
      return {
        sqlEq:
          "EXISTS (SELECT 1 FROM relationship r JOIN protocol pr ON r.object_type = 'protocol' AND r.object_id = pr.id WHERE r.subject_type = 'device' AND r.subject_id = d.id AND r.predicate = 'supports-protocol' AND (pr.code = ? OR pr.aliases_json LIKE ?))",
      }
    case 'estandar':
      return {
        sqlEq:
          "EXISTS (SELECT 1 FROM relationship r2 JOIN standard st ON r2.object_type = 'standard' AND r2.object_id = st.id WHERE r2.subject_type = 'device' AND r2.subject_id = d.id AND r2.predicate = 'implements-standard' AND (st.org = ? OR st.identifier = ? OR ? = '*'))",
      }
    case 'capa':
      return {
        sqlEq: "EXISTS (SELECT 1 FROM json_each(d.osi_profile_json, '$.terminate') ce WHERE CAST(ce.value AS INTEGER) BETWEEN ? AND ?)",
        sqlRange:
          "EXISTS (SELECT 1 FROM json_each(d.osi_profile_json, '$.terminate') cre WHERE CAST(cre.value AS INTEGER) BETWEEN ? AND ?)",
      }
    case 'medio':
      return {
        sqlEq:
          "EXISTS (SELECT 1 FROM relationship r3 JOIN medium md ON r3.object_type = 'medium' AND r3.object_id = md.id WHERE r3.subject_type = 'device' AND r3.subject_id = d.id AND r3.predicate = 'terminates-medium' AND (md.code = ? OR md.name LIKE ?))",
      }
    case 'interfaz':
      return { sqlEq: "EXISTS (SELECT 1 FROM port p5 WHERE p5.device_id = d.id AND (p5.interface_code = ? OR p5.interface_code LIKE ?))" }
    case 'estado':
      return { sqlEq: 'd.lifecycle_status = ?' }
    case 'anio':
      return {
        sqlEq: "CAST(substr(COALESCE(d.released_on, d.announced_on, ''), 1, 4) AS INTEGER) >= ?",
        sqlRange:
          "CAST(substr(COALESCE(d.released_on, d.announced_on, ''), 1, 4) AS INTEGER) BETWEEN ? AND ?",
      }
    case 'formato':
      return { sqlEq: "EXISTS (SELECT 1 FROM port p6 WHERE p6.device_id = d.id AND (p6.interface_code = ? OR p6.label LIKE ?))" }
  }
}

function parametrosPara(clave: ClaveDsl, valor: string): SqlValue[] {
  switch (clave) {
    case 'cat': return [valor, likeTerm(valor)]
    case 'fabricante': return [valor]
    case 'puertos': return [Number(valor)]
    case 'velocidad': // DSL en Gbps → BD en Mbps
      return [Number(valor) * 1000]
    case 'poe': return valor === '*' ? [valor, ''] : [valor, valor]
    case 'protocolo': return [valor, likeTerm(valor)]
    case 'estandar':
      return valor.includes('/') ? [valor.split('/')[0]!, valor.split('/')[1]!, valor] : [valor, valor, valor]
    case 'capa': return [Number(valor), Number(valor)]
    case 'medio': return [valor, likeTerm(valor)]
    case 'interfaz':
    case 'formato': return [valor, likeTerm(valor)]
    case 'estado': return [valor]
    case 'anio': return [Number(valor)]
  }
}

function compileTermino(termino: DslTermino): CompiledWhere {
  switch (termino.kind) {
    case 'texto':
      return { clause: '1', params: [], joins: [] }
    case 'igual': {
      const base = baseFor(termino.clave)
      return { clause: base.sqlEq, params: parametrosPara(termino.clave, termino.valor), joins: [] }
    }
    case 'rango': {
      const base = baseFor(termino.clave)
      const sql = base.sqlRange ?? base.sqlEq
      const factor = termino.clave === 'velocidad' ? 1000 : 1 // DSL en Gbps → Mbps
      return { clause: sql, params: [termino.desde * factor, termino.hasta * factor], joins: [] }
    }
    case 'negacion':
      return not(compileTermino(termino.operando))
    case 'requerido':
      return compileTermino(termino.operando)
  }
}

function not(inner: CompiledWhere): CompiledWhere {
  return { clause: `(NOT (${inner.clause}))`, params: inner.params, joins: inner.joins }
}

/**
 * Compila una consulta DSL a un WHERE completo para la lista de dispositivos.
 * El texto libre se delega al índice FTS (rawText), que el caller une en el FROM.
 * El resultado incluye la cláusula FTS si hay rawText; el caller no debe añadirla de nuevo.
 */
export function compileDsl(
  ast: ConsultaDsl,
  opts: { rawText?: string } = {},
): { where: string; params: SqlValue[]; joins: string[]; hasMatch: boolean } {
  const clausulas: string[] = []
  const params: SqlValue[] = []
  const joins = new Set<string>()

  const hasText = (opts.rawText ?? '').trim().length > 0
  if (hasText) {
    const t = opts.rawText!.trim().split(/\s+/).map((x) => `"${x.replace(/"/g, '""')}"*`).join(' AND ')
    clausulas.push('fts_device MATCH ?')
    params.push(t)
  }

  for (const termino of ast.terminos) {
    if (termino.kind === 'texto') continue // ya gestionado por rawText/FTS
    const compiled = compileTermino(termino)
    const fragmento = compiled.clause.startsWith('(') ? compiled.clause : `(${compiled.clause})`
    clausulas.push(fragmento)
    params.push(...compiled.params)
    for (const j of compiled.joins) joins.add(j)
  }

  const where = clausulas.length > 0 ? clausulas.join(' AND ') : '1'
  return { where, params, joins: [...joins], hasMatch: hasText }
}

/** Rango de capas de una consulta (para la vista OSI inversa, §8.4.2). */
export function rangoCapas(ast: ConsultaDsl): { min: number; max: number } | undefined {
  const rangos = ast.terminos.filter((t): t is Extract<DslTermino, { kind: 'rango' }> => t.kind === 'rango' && t.clave === 'capa')
  const iguales = ast.terminos.filter((t): t is Extract<DslTermino, { kind: 'igual' }> => t.kind === 'igual' && t.clave === 'capa')
  const nums = [
    ...rangos.flatMap((r) => [r.desde, r.hasta]),
    ...iguales.map((i) => Number(i.valor)),
  ].filter((n) => Number.isFinite(n))
  if (nums.length === 0) return undefined
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

// Re-export de tipo para consumidores externos
export type { ClaveDsl }

// Guard de árbol muerto para PREDICATES (usado por consumidores de predicados)
export const _util = { PREDICATES }