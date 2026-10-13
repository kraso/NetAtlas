import type { SqliteDriver } from '../driver.js'

/**
 * `resolverEntidad` del asistente: resuelve un nombre comercial
 * ("catalyst 9300", "aruba 2930f") al slug real del catálogo.
 */

/** Palabras que no identifican un dispositivo (preguntas, unidades, genéricos). */
const MULETILLAS: readonly string[] = [
  'que es', 'cual es', 'cuales son', 'cuantos puertos', 'cuantas puertos', 'cuantos', 'cuantas', 'cuanto', 'puertos',
  'tiene', 'cubre', 'capas', 'necesito', 'conectar', 'para', 'con', 'que', 'por', 'una', 'un', 'el', 'la', 'los',
  'las', 'de', 'del', 'y', 'como', 'funciona', 'es', 'son', 'hay', 'quien', 'fabrica', 'rendimiento', 'throughput',
  'gbps', 'mbps', 'consumo', 'velocidad', 'mejor', 'alternativa', 'moderna', 'reemplaza', 'sucede', 'precede',
  'switch', 'router', 'firewall', 'ap', 'inalambric', 'wireless', '4sfp', '48g', 'sfp', 'plus', 'ethernet',
]

export async function resolverEntidad(db: SqliteDriver, textoNormalizado: string): Promise<string | undefined> {
  const tokens = tokenizar(textoNormalizado)
  if (tokens.length === 0) return undefined
  // Estrategia: primero AND de todos los tokens (unívoco si el nombre los
  // contiene); si no hay match, el token más raro del catálogo.
  const exacto = buscarConTodosLosTokens(db, tokens)
  if (exacto) return exacto
  return mejorPorFrecuencia(db, tokens)
}

/** Tokens significativos del texto (sin muletillas ni palabras de <3 letras). */
function tokenizar(textoNormalizado: string): string[] {
  return textoNormalizado
    .replace(/[¿?¡!.,]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !MULETILLAS.includes(t))
}

/**
 * Dispositivo cuyo nombre contiene TODOS los tokens.
 * Parameterizado: cada token aporta 2 marcadores (?) → evita SQL injection.
 */
function buscarConTodosLosTokens(db: SqliteDriver, tokens: readonly string[]): string | undefined {
  const placeholders = tokens.map(() => '(lower(d.name) LIKE ? OR lower(d.commercial_name) LIKE ?)').join(' AND ')
  const row = db
    .prepare(`SELECT d.slug FROM device d WHERE ${placeholders} ORDER BY d.id LIMIT 1`)
    .get(...tokens.flatMap((t) => [`%${t}%`, `%${t}%`])) as { slug: string } | undefined
  return row?.slug
}

/** Slug más repetido entre los candidatos de cada token (desempate por orden de catálogo). */
function mejorPorFrecuencia(db: SqliteDriver, tokens: readonly string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const t of tokens) {
    for (const slug of candidatosDe(db, t)) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  let mejor: string | undefined
  let mejorN = 0
  for (const [s, n] of counts) {
    if (n > mejorN) {
      mejor = s
      mejorN = n
    }
  }
  return mejor
}

/** Hasta 3 dispositivos cuyo nombre contiene el token. */
function candidatosDe(db: SqliteDriver, token: string): string[] {
  const rows = db
    .prepare(
      `SELECT d.slug FROM device d
       WHERE lower(d.name) LIKE ? OR lower(d.commercial_name) LIKE ?
       ORDER BY d.id LIMIT 3`,
    )
    .all(`%${token}%`, `%${token}%`) as { slug: string }[]
  return rows.map((r) => r.slug)
}
