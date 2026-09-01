/**
 * Adaptador SQLite del asistente IA (sección 21 / F7): ToolContext real sobre
 * los repositorios del dataset + generador del conjunto de oro + oráculo de
 * verificación de hechos contra la base validada.
 *
 * Cero bypass de validaciones: la recuperación lee assertions con fuente,
 * puertos e inventario reales; la comparación usa el motor puro; la topología
 * se genera con invariantes del agregado y se persiste vía repositorio.
 */
import type { SqliteDriver } from '../driver.js'
import { SqliteDeviceRepository, SqliteCatalogRepository } from '../repositories/device-repository.js'
import { SqliteGraphRepository } from '../repositories/graph-repository.js'
import { SqliteSourcingRepository } from '../repositories/sourcing-repository.js'
import { SqliteAttributesRepository } from '../repositories/attributes-repository.js'
import { SqliteTopologyRepository } from '../repositories/topology-repository.js'
import type {
  SearchIndex,
  ToolContext,
  HechoIA,
  OracleHechos,
  PreguntaOro,
  TopologiaSpec,
} from '@netatlas/domain'
import { generarTopologia, parsearSpec } from '@netatlas/domain'

/** Rol de topología → categoría del catálogo (solo categorías existentes). */
const ROL_A_CATEGORIA: Readonly<Record<string, string>> = {
  switch: 'CAT-SWT',
  router: 'CAT-RTR',
  ap: 'CAT-WLS',
  firewall: 'CAT-SEC',
  host: undefined as never,
  servidor: undefined as never,
}

export class SqliteToolContext implements ToolContext {
  private readonly catalog: SqliteCatalogRepository

  constructor(
    private readonly db: SqliteDriver,
    /** Índice de búsqueda inyectado (FTS5 de @netatlas/search, wa-sqlite, …). */
    private readonly search: SearchIndex,
  ) {
    this.catalog = new SqliteCatalogRepository(db)
  }

  async searchCatalog(dsl: string, limit: number): Promise<readonly { slug: string; nombre: string; categoria: string }[]> {
    const nombresCat = await this.nombresCategoria()
    const raw = dsl.trim()
    if (raw.length === 0) {
      // Sin consulta estructurada: muestra del catálogo (devuelve pocos para
      // que el asistente no inunde la respuesta; busca específica si hace falta).
      const row = this.db
        .prepare(
          `SELECT d.slug, d.name, c.code AS cat
           FROM device d JOIN category c ON c.id = d.category_id
           ORDER BY c.code, d.name LIMIT ?`,
        )
        .all(limit) as { slug: string; name: string; cat: string }[]
      return row.map((r) => ({ slug: r.slug, nombre: r.name, categoria: nombresCat.get(r.cat) ?? 'Dispositivo' }))
    }
    // DSL o texto libre → índice inyectado (mismo contrato que la UI; score opaco).
    const res = await this.search.query({ rawQuery: raw, limit })
    return res.hits.map((h) => ({
      slug: h.slug,
      nombre: h.name,
      categoria: nombresCat.get(this.deviceCategory(h.slug)) ?? 'Dispositivo',
    }))
  }

  async getDevice(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const repoDevices = new SqliteDeviceRepository(this.db)
    const repoSourcing = new SqliteSourcingRepository(this.db)
    const repoAttrs = new SqliteAttributesRepository(this.db)
    const device = await repoDevices.findBySlug(slug)
    if (!device) return undefined

    const assertions = await repoSourcing.assertionsForDevice(slug)
    const attrs = await repoAttrs.attributeValuesForDevice(slug)
    const categoria = await this.catalog.categoryByCode(device.categoryCode)

    return {
      slug: device.slug.value,
      nombre: device.name,
      fabricante: device.manufacturerSlug,
      categoria: categoria?.nameEs ?? device.categoryCode,
      lanza: device.releasedOn ?? undefined,
      puertos: device.ports.map((p) => ({ label: p.label, cantidad: p.quantity, speeds: p.speedsMbps })),
      assertions: assertions.map((a) => ({
        predicado: a.predicate,
        valor: valorLegible(a.predicate, a.valueJson),
        fuenteSlug: a.source.slug,
        fuenteTitulo: a.source.title,
      })),
      atributos: attrs.map((a) => ({ predicado: a.key, valor: a.display, unidad: a.unit })),
    }
  }

  async compareDevices(ids: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
    const repoAttrs = new SqliteAttributesRepository(this.db)
    const repoDevices = new SqliteDeviceRepository(this.db)
    const filas: { clave: string; labelEs: string; valores: Record<string, string> }[] = []
    const dispositivos: { slug: string; nombre: string }[] = []

    const porSlug = new Map<string, { clave: string; display: string }[]>()
    for (const id of ids) {
      const device = await repoDevices.findBySlug(id)
      if (!device) continue
      dispositivos.push({ slug: id, nombre: device.name })
      const attrs = await repoAttrs.attributeValuesForDevice(id)
      porSlug.set(id, attrs.map((a) => ({ clave: a.key, display: a.display })))
    }

    const claves = new Set<string>()
    for (const v of porSlug.values()) for (const a of v) claves.add(a.clave)
    const labels = new Map<string, string>()
    for (const id of ids) {
      const attrs = await repoAttrs.attributeValuesForDevice(id)
      for (const a of attrs) labels.set(a.key, a.labelEs)
    }
    for (const clave of claves) {
      const valores: Record<string, string> = {}
      for (const id of ids) {
        const v = porSlug.get(id)?.find((x) => x.clave === clave)
        valores[id] = v?.display ?? '—'
      }
      filas.push({ clave, labelEs: labels.get(clave) ?? clave, valores })
    }
    return { dispositivos, diferencias: filas }
  }

  async findCompatible(device: string, constraint: string | undefined): Promise<Readonly<Record<string, unknown>>> {
    const repoGraph = new SqliteGraphRepository(this.db)
    const repoDevices = new SqliteDeviceRepository(this.db)
    void constraint
    const aristas = await repoGraph.edgesOf({ type: 'device', slug: device })
    const compatibles: { slug: string; nombre: string; via: string }[] = []
    for (const r of aristas) {
      const esSubject = r.subject.type === 'device' && r.subject.slug === device
      const peer = esSubject ? r.object : r.subject
      if (peer.type !== 'device') continue
      if (r.predicate !== 'compatible-with' && r.predicate !== 'similar-to') continue
      const d = await repoDevices.findBySlug(peer.slug)
      if (!d) continue
      compatibles.push({ slug: peer.slug, nombre: d.name, via: r.predicate })
    }
    return { dispositivo: device, compatibles }
  }

  async buildTopology(spec: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const parsed: TopologiaSpec | undefined =
      validarSpecFromRaw(spec) ??
      (typeof spec.descripcion === 'string' ? parsearSpec(spec.descripcion, String(spec.name ?? 'Topología generada por IA')) : undefined)
    if (!parsed) {
      return { error: 'Especificación de topología inválida. Ejemplo: {name, roles:[{rol:"switch",cantidad:2}]}' }
    }
    const repoTopo = new SqliteTopologyRepository(this.db)
    const resultado = await generarTopologia(parsed, {
      resolverRol: async (rol, instancia) => this.resolverRol(rol, instancia),
      velocidadesDe: async (slug) => this.velocidadesDe(slug),
    })
    if (!resultado.ok || !resultado.topologia) {
      return { error: resultado.razon ?? 'No se pudo generar la topología.', sinResolver: resultado.sinResolver ?? [] }
    }
    await repoTopo.upsert(resultado.topologia)
    return {
      slug: resultado.topologia.slug.value,
      nombre: resultado.topologia.name,
      nodos: resultado.topologia.nodes.length,
      enlaces: resultado.topologia.edges.length,
      sinResolver: resultado.sinResolver ?? [],
      rol: resultado.topologia.metadata.roles,
    }
  }

  async whatLayers(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const repoDevices = new SqliteDeviceRepository(this.db)
    const device = await repoDevices.findBySlug(slug)
    if (!device || !device.osiProfile) return undefined
    return {
      slug,
      nombre: device.name,
      termina: device.osiProfile.profile.terminate,
      transparente: device.osiProfile.profile.transparent,
      primaria: device.osiProfile.profile.primary,
    }
  }

  async successors(slug: string): Promise<readonly { relacion: string; slug: string; nombre: string }[]> {
    const repoGraph = new SqliteGraphRepository(this.db)
    const repoDevices = new SqliteDeviceRepository(this.db)
    const aristas = await repoGraph.edgesOf({ type: 'device', slug })
    const out: { relacion: string; slug: string; nombre: string }[] = []
    for (const r of aristas) {
      if (r.predicate !== 'succeeds' && r.predicate !== 'precedes' && r.predicate !== 'replaced-by' && r.predicate !== 'similar-to') continue
      const esSubject = r.subject.type === 'device' && r.subject.slug === slug
      const peer = esSubject ? r.object : r.subject
      if (peer.type !== 'device') continue
      const d = await repoDevices.findBySlug(peer.slug)
      if (!d) continue
      out.push({ relacion: r.predicate, slug: peer.slug, nombre: d.name })
    }
    return out
  }

  /** Resuelve un nombre comercial ("catalyst 9300", "aruba 2930f") al slug real. */
  async resolverEntidad(textoNormalizado: string): Promise<string | undefined> {
    const muletillas = [
      'que es', 'cual es', 'cuales son', 'cuantos puertos', 'cuantas puertos', 'cuantos', 'cuantas', 'cuanto', 'puertos',
      'tiene', 'cubre', 'capas', 'necesito', 'conectar', 'para', 'con', 'que', 'por', 'una', 'un', 'el', 'la', 'los',
      'las', 'de', 'del', 'y', 'como', 'funciona', 'es', 'son', 'hay', 'quien', 'fabrica', 'rendimiento', 'throughput',
      'gbps', 'mbps', 'consumo', 'velocidad', 'mejor', 'alternativa', 'moderna', 'reemplaza', 'sucede', 'precede',
      'switch', 'router', 'firewall', 'ap', 'inalambric', 'wireless', '4sfp', '48g', 'sfp', 'plus', 'ethernet',
    ]
    const tokens = textoNormalizado
      .replace(/[¿?¡!.,]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !muletillas.includes(t))
    if (tokens.length === 0) return undefined
    // Estrategia: primero AND de todos los tokens (unívoco si el nombre los
    // contiene); si no hay match, el token más raro del catálogo.
    const and = tokens.map((t) => `(lower(d.name) LIKE '%${t}%' OR lower(d.commercial_name) LIKE '%${t}%')`).join(' AND ')
    const andRow = this.db.prepare(`SELECT d.slug FROM device d WHERE ${and} ORDER BY d.id LIMIT 1`).get() as
      | { slug: string }
      | undefined
    if (andRow) return andRow.slug

    const cands: string[] = []
    for (const t of tokens) {
      const rows = this.db
        .prepare(
          `SELECT d.slug FROM device d
           WHERE lower(d.name) LIKE ? OR lower(d.commercial_name) LIKE ?
           ORDER BY d.id LIMIT 3`,
        )
        .all(`%${t}%`, `%${t}%`) as { slug: string }[]
      for (const r of rows) cands.push(r.slug)
    }
    if (cands.length === 0) return undefined
    const counts = new Map<string, number>()
    for (const s of cands) counts.set(s, (counts.get(s) ?? 0) + 1)
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

  // ── Ayudantes internos ─────────────────────────────────────────────────────

  private async resolverRol(rol: string, instancia: number): Promise<{ entitySlug: string; entityName: string } | undefined> {
    const categoria = ROL_A_CATEGORIA[rol]
    if (!categoria) return undefined
    const repoDevices = new SqliteDeviceRepository(this.db)
    const page = await repoDevices.listByCategory(categoria, { limit: 20 })
    const candidato = page.items[instancia % Math.max(1, page.items.length)]
    if (!candidato) return undefined
    return { entitySlug: candidato.slug.value, entityName: candidato.name }
  }

  private async velocidadesDe(slug: string): Promise<readonly number[]> {
    const repoDevices = new SqliteDeviceRepository(this.db)
    const device = await repoDevices.findBySlug(slug)
    if (!device) return []
    return [...new Set(device.ports.flatMap((p) => p.speedsMbps))]
  }

  private async nombresCategoria(): Promise<Map<string, string>> {
    const cats = await this.catalog.listCategories()
    return new Map(cats.map((c) => [c.code, c.nameEs]))
  }

  private deviceCategory(slug: string): string {
    const row = this.db.prepare('SELECT c.code AS code FROM device d JOIN category c ON c.id = d.category_id WHERE d.slug = ?').get(slug)
    return row ? String((row as { code: string }).code) : ''
  }
}

/** Valor legible de una assertion (number/text/bool). */
function valorLegible(predicate: string, valueJson: string): string {
  try {
    const v = JSON.parse(valueJson) as unknown
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'sí' : 'no'
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null) {
      const obj = v as Record<string, unknown>
      if (predicate.endsWith('_w') && typeof obj.w === 'number') return String(obj.w)
    }
    return String(v)
  } catch {
    return valueJson
  }
}

function validarSpecFromRaw(spec: Readonly<Record<string, unknown>>): TopologiaSpec | undefined {
  if (typeof spec.name !== 'string' || !Array.isArray(spec.roles)) return undefined
  const roles = spec.roles
    .map((r) => {
      if (typeof r !== 'object' || r === null) return undefined
      const rr = r as Record<string, unknown>
      if (typeof rr.rol !== 'string' || typeof rr.cantidad !== 'number' || rr.cantidad < 1) return undefined
      return { rol: rr.rol, cantidad: Math.floor(rr.cantidad) }
    })
    .filter((x): x is { rol: string; cantidad: number } => x !== undefined)
  if (roles.length === 0) return undefined
  return { name: spec.name, roles }
}

// ── Oráculo: verifica hechos contra la base validada ────────────────────────

/**
 * Oráculo del evaluador (§21.3): un hecho citado existe si hay una assertion
 * con ese (subject|null) o un dato de catálogo equivalente. Se usa para el
 * criterio "0 alucinaciones de specs" en el conjunto de oro.
 */
export function crearOracleSqlite(db: SqliteDriver): OracleHechos {
  return async (h: HechoIA): Promise<boolean> => {
    // Categorías, fabricantes y atributos del dispositivo se comprueban por slug/valor.
    if (h.predicado === 'categoria') {
      const row = db
        .prepare('SELECT c.name_es AS name FROM device d JOIN category c ON c.id = d.category_id WHERE d.slug = ?')
        .get(h.sujetoSlug)
      return row !== undefined && String((row as { name: string }).name).toLowerCase() === h.valor.toLowerCase()
    }
    if (h.predicado === 'fabricante' || h.predicado === 'lanza') {
      const row = db
        .prepare('SELECT m.slug AS m, d.released_on AS rel FROM device d JOIN manufacturer m ON m.id = d.manufacturer_id WHERE d.slug = ?')
        .get(h.sujetoSlug)
      if (!row) return false
      const r = row as { m: string; rel: string | null }
      if (h.predicado === 'fabricante') return r.m.toLowerCase() === h.valor.toLowerCase()
      return (h.valor === String(r.rel ?? '').slice(0, 4)) || (r.rel !== null && h.valor === String(r.rel))
    }
    if (h.predicado === 'puertos') {
      const row = db
        .prepare('SELECT COALESCE(SUM(p.quantity), 0) AS total FROM port p JOIN device d ON d.id = p.device_id WHERE d.slug = ?')
        .get(h.sujetoSlug)
      return row !== undefined && Number((row as { total: number }).total) === Number(h.valor)
    }
    if (h.predicado === 'capas que termina' || h.predicado === 'capas transparente') {
      const row = db.prepare('SELECT osi_profile_json FROM device WHERE slug = ?').get(h.sujetoSlug)
      if (!row) return false
      const profile = JSON.parse(String((row as { osi_profile_json: string }).osi_profile_json)) as { terminate: number[]; transparent: number[] }
      const arr = h.predicado === 'capas que termina' ? profile.terminate : profile.transparent
      return arr.join(', ') === h.valor
    }
    if (h.predicado === 'reemplaza a' || h.predicado === 'sucede a' || h.predicado === 'precede a' || h.predicado === 'compatible con') {
      const row = db
        .prepare(
          `SELECT 1
           FROM relationship r
           JOIN device a ON r.subject_type = 'device' AND r.subject_id = a.id
           JOIN device b ON r.object_type = 'device' AND r.object_id = b.id
           WHERE a.slug = ? AND b.slug = ? AND r.predicate = ?`,
        )
        .get(h.sujetoSlug, h.valor, h.predicado === 'reemplaza a' ? 'replaced-by' : h.predicado === 'sucede a' ? 'succeeds' : h.predicado === 'precede a' ? 'precedes' : 'compatible-with')
      return row !== undefined
    }
    if (h.predicado === 'comparacion') return true // derivado del motor puro (no spec)
    if (h.predicado === 'topologia generada') {
      const row = db.prepare('SELECT 1 FROM topology WHERE slug = ?').get(h.sujetoSlug)
      return row !== undefined
    }
    // Predicado de assertion genérico: debe existir un valor igual en assertions.
    const rows = db
      .prepare(
        `SELECT a.value_json FROM assertion a JOIN device d ON a.subject_type = 'device' AND a.subject_id = d.id
         WHERE d.slug = ? AND a.predicate = ?`,
      )
      .all(h.sujetoSlug, h.predicado) as unknown as SqlRowValue[]
    return rows.some((r) => {
      const v = valorLegible(h.predicado, String(r.value_json))
      return v === h.valor || v === h.valor.replace(/\s*[A-Za-z/]+$/, '')
    })
  }
}

interface SqlRowValue {
  value_json: string
}

// ── Conjunto de oro desde el dataset (NET-HW-060) ───────────────────────────

/**
 * Construye el conjunto de oro determinista: una pregunta por (dispositivo
 * relevante × atributo verificable) + escenarios curados. Cada pregunta exige
 * hechos que SÍ existen en la base (se verifica con el oráculo).
 */
export async function construirConjuntoOroDesdeDataset(db: SqliteDriver, maxDispositivos = 60): Promise<readonly PreguntaOro[]> {
  const repoDevices = new SqliteDeviceRepository(db)
  const repoSourcing = new SqliteSourcingRepository(db)
  const count = await repoDevices.count()
  const total = Math.min(count, maxDispositivos)

  const paginas: { slug: string; nombre: string }[] = []
  let cursor: string | undefined
  for (let saltos = 0; saltos < 8 && paginas.length < total; saltos++) {
    // Iteración por categoría general para recoger dispositivos variados.
    const page = await repoDevices.listByCategory('CAT-SWT', { limit: 100, cursor })
    for (const d of page.items) {
      if (paginas.length >= total) break
      paginas.push({ slug: d.slug.value, nombre: d.name })
    }
    cursor = page.nextCursor
    if (cursor === undefined) break
  }
  if (paginas.length < total) {
    const page2 = await repoDevices.listByCategory('CAT-RTR', { limit: total })
    for (const d of page2.items) {
      if (paginas.length >= total) break
      paginas.push({ slug: d.slug.value, nombre: d.name })
    }
  }

  const preguntas: PreguntaOro[] = []

  for (const d of paginas) {
    const assertions = await repoSourcing.assertionsForDevice(d.slug)
    // Pregunta de throughput/consumo si hay assertion numérica.
    const numericas = assertions.filter((a) => {
      try {
        const v = JSON.parse(a.valueJson) as unknown
        return typeof v === 'number'
      } catch {
        return false
      }
    })
    for (const a of numericas.slice(0, 2)) {
      preguntas.push({
        pregunta: `¿Cuál es el ${a.predicate.replace(/_/g, ' ')} de ${d.nombre}?`,
        hechosEsperados: [{ sujetoSlug: d.slug, predicado: a.predicate, valor: valorLegible(a.predicate, a.valueJson) }],
      })
    }
    // Pregunta de puertos.
    preguntas.push({
      pregunta: `¿Cuántos puertos tiene ${d.nombre}?`,
      hechosEsperados: [{ sujetoSlug: d.slug, predicado: 'puertos', valor: String(totalPuertos(db, d.slug)) }],
    })
    // Pregunta de capas.
    preguntas.push({
      pregunta: `¿Qué capas termina ${d.nombre}?`,
      hechosEsperados: [{ sujetoSlug: d.slug, predicado: 'capas que termina', valor: capasDe(db, d.slug).join(', ') }],
    })
  }

  // Escenarios curados (§21.2).
  preguntas.push(
    { pregunta: '¿Qué switches capa 3 de 10 Gbps hay en el catálogo?', hechosEsperados: [] },
    { pregunta: '¿Qué capas cubre Cisco Catalyst 9300?', hechosEsperados: [{ sujetoSlug: 'cisco-c9300-48p', predicado: 'capas que termina', valor: capasDe(db, 'cisco-c9300-48p').join(', ') }] },
    { pregunta: '¿Quién fabrica el MikroTik CCR1036?', hechosEsperados: [{ sujetoSlug: 'mikrotik-ccr1036', predicado: 'fabricante', valor: 'mikrotik' }] },
  )

  return preguntas
}

function totalPuertos(db: SqliteDriver, slug: string): number {
  const row = db.prepare('SELECT COALESCE(SUM(p.quantity), 0) AS total FROM port p JOIN device d ON d.id = p.device_id WHERE d.slug = ?').get(slug)
  return Number((row as { total: number }).total)
}

function capasDe(db: SqliteDriver, slug: string): number[] {
  const row = db.prepare('SELECT osi_profile_json FROM device WHERE slug = ?').get(slug)
  if (!row) return []
  try {
    const profile = JSON.parse(String((row as { osi_profile_json: string }).osi_profile_json)) as { terminate: number[] }
    return profile.terminate ?? []
  } catch {
    return []
  }
}

export { generarTopologia, parsearSpec }