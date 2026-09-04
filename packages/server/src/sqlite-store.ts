/**
 * Adaptador SQLite del servidor (F8A). Usa el runtime real de NetAtlas
 * (packages/data + FTS5 de packages/search) — mismo SQL, mismos datos, misma
 * API. Es el almacén por defecto para un despliegue local de un solo nodo.
 *
 * Los "cambios" del snapshot se registran en una tabla runtime-only
 * (`netatlas_catalog_version`) para poder servir deltas desde una versión.
 */
import type { SqliteDriver } from '@netatlas/data'
import type { SearchIndex } from '@netatlas/domain'
import { mergeLWWporEntidad } from '@netatlas/domain'
import type { ServidorStore, ServerDevice, ServerHit, ServerSnapshotRow, SnapshotLink, SnapshotDetail, SqlExecutor, DatasetPublico } from './store.js'
import { EMPTY_SNAPSHOT_DETAIL } from './store.js'
import type { SyncAssertion, SyncAttributeValue, SyncDatasheet, SyncDeviceDetail, SyncDeviceRelation, SyncPort } from '@netatlas/domain'
import type { OutboxEntry } from '@netatlas/domain'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

/**
 * Cadena legible de un valor EAV (misma regla que SqliteAttributesRepository:
 * number/range en crudo, bool como si/no, texto en crudo, '—' si ausente).
 */
function mostrarValor(
  type: string,
  num: number | null,
  txt: string | null,
  bool: number | null,
): string {
  if (type === 'number' || type === 'range') {
    return num !== null ? String(Number(num)) : '—'
  }
  if (bool !== null) return Number(bool) === 1 ? 'sí' : 'no'
  if (txt !== null) return String(txt)
  return '—'
}

const SQL_META = `
  CREATE TABLE IF NOT EXISTS netatlas_catalog_version (
    version INTEGER PRIMARY KEY,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS netatlas_contribuciones (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    entidad TEXT NOT NULL,
    autor TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    received_at TEXT NOT NULL,
    revision INTEGER NOT NULL
  );
`

export class SqliteExecutor implements SqlExecutor {
  constructor(private readonly db: SqliteDriver) {
    db.exec(SQL_META)
  }

  async query<T>(sql: string, params: readonly (string | number | null)[] = []): Promise<readonly T[]> {
    return this.db.prepare(sql).all(...params) as unknown as readonly T[]
  }

  async exec(sql: string, params: readonly (string | number | null)[] = []): Promise<{ changes: number }> {
    const res = this.db.prepare(sql).run(...params)
    return { changes: Number(res.changes) }
  }
}

export class SqliteServidorStore implements ServidorStore {
  constructor(
    private readonly db: SqliteDriver,
    private readonly executor: SqliteExecutor,
    private readonly indiceBusqueda: SearchIndex,
    /** Ruta real del archivo SQLite (para servir el dataset firmado, §31.3). */
    private readonly dbPath?: string,
  ) {}

  /** Conjuntos de datos descargables firmados (§31.3 / F8B futuro). */
  async conjuntosDeDatos(): Promise<readonly DatasetPublico[]> {
    if (!this.dbPath || !existsSync(this.dbPath)) return []
    const buffer = readFileSync(this.dbPath)
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const manifiestoPath = `${this.dbPath}.manifest.json`
    let manifiesto: Record<string, unknown> = { sha256 }
    if (existsSync(manifiestoPath)) {
      try {
        manifiesto = JSON.parse(readFileSync(manifiestoPath, 'utf8')) as Record<string, unknown>
      } catch {
        // Sin manifiesto legible: se sirve el hash calculado igualmente.
      }
    }
    return [
      {
        nombre: 'netatlas-seed',
        manifiesto,
        blob: new Blob([buffer], { type: 'application/x-sqlite3' }),
        sha256,
      },
    ]
  }

  async describe(slug: string): Promise<ServerDevice | undefined> {
    const rows = await this.executor.query<{
      slug: string
      name: string
      manufacturer_slug: string
      category_code: string
      category_name: string
      lifecycle_status: string
    }>(
      `SELECT d.slug, d.name, m.slug AS manufacturer_slug, c.code AS category_code,
              c.name_es AS category_name, d.lifecycle_status
       FROM device d
       JOIN manufacturer m ON m.id = d.manufacturer_id
       JOIN category c ON c.id = d.category_id
       WHERE d.slug = ?`,
      [slug],
    )
    const r = rows[0]
    if (!r) return undefined
    return {
      slug: r.slug,
      name: r.name,
      manufacturerSlug: r.manufacturer_slug,
      categoryCode: r.category_code,
      categoryName: r.category_name,
      lifecycleStatus: r.lifecycle_status,
    }
  }

  async search(q: string, limit: number): Promise<readonly ServerHit[]> {
    const res = await this.indiceBusqueda.query({ rawQuery: q, limit })
    return res.hits.map((h) => ({ slug: h.slug, name: h.name, score: h.score }))
  }

  async categorias(): Promise<readonly { code: string; nameEs: string }[]> {
    const rows = await this.executor.query<{ code: string; name_es: string }>(
      'SELECT code, name_es FROM category ORDER BY code',
    )
    return rows.map((r) => ({ code: r.code, nameEs: r.name_es }))
  }

  async snapshot(since: number): Promise<readonly ServerSnapshotRow[]> {
    const base = await this.version()
    if (since >= base) return []
    const filas = await this.executor.query<{
      slug: string
      name: string
      manufacturer_slug: string
      category_code: string
      lifecycle_status: string
      updated_at: string
    }>(
      `SELECT d.slug, d.name, m.slug AS manufacturer_slug, c.code AS category_code,
              d.lifecycle_status, COALESCE(d.updated_at, '1970-01-01') AS updated_at
       FROM device d
       JOIN manufacturer m ON m.id = d.manufacturer_id
       JOIN category c ON c.id = d.category_id
       WHERE ? = 0 OR d.id > ?
       ORDER BY d.id
       LIMIT 5000`,
      [since, since],
    )
    return filas.map((f) => ({
      slug: f.slug,
      name: f.name,
      manufacturerSlug: f.manufacturer_slug,
      categoryCode: f.category_code,
      lifecycleStatus: f.lifecycle_status,
      updatedAt: f.updated_at,
      // La versión de cada fila es la versión servidor en que fue emitida.
      version: base,
    }))
  }

  /** Aristas de topología entre dispositivos (desde topology_edge/runtime-only
   *  cambios; cuando since=0 sirve el snapshot completo de edges).
   *  NOTA: la DB modela topología en `topology_edge` (322 aristas) no en
   *  `relationship` (device→standard/layer/protocol/medium). Se expone como
   *  `compatible-with` (validado en el dominio, simétrico device↔device) para
   *  que el warmezo UI construya el mapa/arquitectura sin un device→device real. */
  async snapshotLinks(since: number): Promise<readonly SnapshotLink[]> {
    const base = await this.version()
    if (since >= base) return []
    const rows = await this.executor.query<{ from_slug: string; to_slug: string }>(
      `SELECT ds.slug AS from_slug, do.slug AS to_slug
       FROM topology_edge e
       JOIN topology_node ns ON ns.id = e.from_node  AND ns.entity_type = 'device'
       JOIN topology_node no ON no.id = e.to_node    AND no.entity_type = 'device'
       JOIN device ds ON ds.id = ns.entity_id
       JOIN device do ON do.id = no.entity_id
       WHERE ds.slug <> do.slug
       ORDER BY ds.slug, do.slug`,
    )
    return rows.map((r) => ({ from: r.from_slug, to: r.to_slug, predicate: 'compatible-with' }))
  }

  /**
   * Detalle por dispositivo para la ficha UI sin N+1 (F8B-detalle): resumen,
   * perfil OSI, puertos, aristas de catálogo (protocolos/capas/estándares/medios),
   * afirmaciones con fuente, valores EAV + catálogos y definiciones globales.
   * Códigos resueltos por JOIN (el cliente no necesita ids numéricos).
   */
  async snapshotDetail(_since: number): Promise<SnapshotDetail> {
    const base = await this.version()
    if (_since >= base) return EMPTY_SNAPSHOT_DETAIL

    const dispositivos = await this.executor.query<{ slug: string; summary: string | null; osi_profile_json: string | null }>(
      'SELECT slug, summary, osi_profile_json FROM device ORDER BY id',
    )
    const puertos = await this.executor.query<{
      device_slug: string; label: string; interface_code: string; quantity: number;
      speeds_json: string | null; poe_standard: string | null; role: string | null; notes: string | null
    }>(
      `SELECT d.slug AS device_slug, p.label, i.code AS interface_code, p.quantity,
              p.speeds_json, p.poe_standard, p.role, p.notes
       FROM port p
       JOIN device d ON d.id = p.device_id
       JOIN interface i ON i.id = p.interface_id
       ORDER BY d.id, p.id`,
    )
    const relaciones = await this.executor.query<{ device_slug: string; predicate: string; object_type: string; object_code: string }>(
      `SELECT d.slug AS device_slug, r.predicate, 'protocol' AS object_type, p.code AS object_code
       FROM relationship r
       JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
       JOIN protocol p ON p.id = r.object_id AND r.object_type = 'protocol'
       WHERE r.predicate = 'supports-protocol'
       UNION ALL
       SELECT d.slug, r.predicate, 'layer', CAST(o.number AS TEXT)
       FROM relationship r
       JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
       JOIN osi_layer o ON o.number = r.object_id AND r.object_type = 'layer'
       WHERE r.predicate = 'operates-at-layer'
       UNION ALL
       SELECT d.slug, r.predicate, 'standard', s.org || '/' || s.identifier
       FROM relationship r
       JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
       JOIN standard s ON s.id = r.object_id AND r.object_type = 'standard'
       WHERE r.predicate = 'implements-standard'
       UNION ALL
       SELECT d.slug, r.predicate, 'medium', m.code
       FROM relationship r
       JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
       JOIN medium m ON m.id = r.object_id AND r.object_type = 'medium'
       WHERE r.predicate = 'terminates-medium'
       UNION ALL
       SELECT d.slug, r.predicate, 'device', do.slug
       FROM relationship r
       JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
       JOIN device do ON do.id = r.object_id AND r.object_type = 'device'
       WHERE r.predicate IN ('succeeds', 'precedes', 'replaced-by', 'variant-of')
         AND do.slug <> d.slug
       ORDER BY device_slug, predicate, object_code`,
    )
    const valores = await this.executor.query<{
      device_slug: string; key: string; value_type: string;
      value_number: number | null; value_text: string | null; value_bool: number | null
    }>(
      `SELECT d.slug AS device_slug, ad.key, ad.value_type,
              da.value_number, da.value_text, da.value_bool
       FROM device_attribute da
       JOIN device d ON d.id = da.device_id
       JOIN attribute_definition ad ON ad.id = da.attribute_id
       ORDER BY d.id, ad.sort_order, ad.key`,
    )
    const definiciones = await this.executor.query<{
      key: string; label_es: string; value_type: string; unit: string | null;
      enum_json: string | null; is_facet: number; is_comparable: number;
      compare_rule: string; category_code: string
    }>(
      `SELECT ad.key, ad.label_es, ad.value_type, ad.unit, ad.enum_json,
              ad.is_facet, ad.is_comparable, ad.compare_rule, c.code AS category_code
       FROM attribute_definition ad
       JOIN category c ON c.id = ad.category_id
       ORDER BY ad.sort_order, ad.key`,
    )
    const afirmaciones = await this.executor.query<{
      subject_slug: string; predicate: string; value_json: string; source_slug: string;
      confidence: string; verified_on: string | null; author: string | null;
      reviewed_by: string | null; note: string | null
    }>(
      `SELECT d.slug AS subject_slug, a.predicate, a.value_json, s.slug AS source_slug,
              a.confidence, a.verified_on, a.author, a.reviewed_by, a.note
       FROM assertion a
       JOIN device d ON d.id = a.subject_id AND a.subject_type = 'device'
       JOIN source s ON s.id = a.source_id
       ORDER BY d.id, a.predicate`,
    )
    const fuentes = await this.executor.query<{
      slug: string; kind: string; publisher: string | null; title: string;
      url: string | null; retrieved_on: string | null; authority_level: number
    }>('SELECT slug, kind, publisher, title, url, retrieved_on, authority_level FROM source ORDER BY slug')
    const fichas = await this.executor.query<{
      device_slug: string; title: string; language: string;
      url: string | null; local_path: string | null; source_slug: string
    }>(
      `SELECT d.slug AS device_slug, f.title, f.language, f.url, f.local_path, s.slug AS source_slug
       FROM datasheet f
       JOIN device d ON d.id = f.device_id
       JOIN source s ON s.id = f.source_id
       ORDER BY d.id, f.title`,
    )
    const protocolos = await this.executor.query<{ code: string; name: string; family: string; osi_layer: number }>(
      'SELECT code, name, family, osi_layer FROM protocol ORDER BY family, code',
    )
    const estandares = await this.executor.query<{ org: string; identifier: string; title: string }>(
      'SELECT org, identifier, title FROM standard ORDER BY org, identifier',
    )
    const medios = await this.executor.query<{ code: string; kind: string; name: string; max_speed_mbps: number | null }>(
      'SELECT code, kind, name, max_speed_mbps FROM medium ORDER BY kind, code',
    )
    const capas = await this.executor.query<{ number: number; name_es: string }>(
      'SELECT number, name_es FROM osi_layer ORDER BY number',
    )
    const fabricantes = await this.executor.query<{ slug: string; snmp_enterprise: number | null }>(
      'SELECT slug, snmp_enterprise FROM manufacturer ORDER BY slug',
    )

    const porPuerto = new Map<string, SyncPort[]>()
    for (const p of puertos) {
      let speeds: number[] = []
      try { speeds = (JSON.parse(p.speeds_json ?? '[]') as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0) } catch { speeds = [] }
      const lista = porPuerto.get(p.device_slug) ?? []
      lista.push({
        label: p.label, interfaceCode: p.interface_code, quantity: Number(p.quantity), speedsMbps: speeds,
        poeStandard: p.poe_standard ?? undefined, role: p.role ?? undefined, notes: p.notes ?? undefined,
      })
      porPuerto.set(p.device_slug, lista)
    }
    const porRelacion = new Map<string, SyncDeviceRelation[]>()
    for (const r of relaciones) {
      const lista = porRelacion.get(r.device_slug) ?? []
      lista.push({ predicate: r.predicate, objectType: r.object_type as SyncDeviceDetail['relations'][number]['objectType'], objectCode: r.object_code })
      porRelacion.set(r.device_slug, lista)
    }
    const porAfirmacion = new Map<string, SyncAssertion[]>()
    for (const a of afirmaciones) {
      const lista = porAfirmacion.get(a.subject_slug) ?? []
      lista.push({
        predicate: a.predicate, valueJson: a.value_json, sourceSlug: a.source_slug,
        confidence: a.confidence, verifiedOn: a.verified_on ?? '1970-01-01', author: a.author ?? 'desconocido',
        reviewedBy: a.reviewed_by ?? undefined, note: a.note ?? undefined,
      })
      porAfirmacion.set(a.subject_slug, lista)
    }
    const porDatasheet = new Map<string, SyncDatasheet[]>()
    for (const f of fichas) {
      const lista = porDatasheet.get(f.device_slug) ?? []
      lista.push({
        title: f.title, language: f.language,
        url: f.url ?? undefined, localPath: f.local_path ?? undefined, sourceSlug: f.source_slug,
      })
      porDatasheet.set(f.device_slug, lista)
    }
    const porValor = new Map<string, SyncAttributeValue[]>()
    for (const v of valores) {
      const lista = porValor.get(v.device_slug) ?? []
      lista.push({ deviceSlug: v.device_slug, key: v.key, display: mostrarValor(v.value_type, v.value_number, v.value_text, v.value_bool) })
      porValor.set(v.device_slug, lista)
    }

    return {
      devices: dispositivos.map((d) => ({
        slug: d.slug,
        summary: d.summary ?? undefined,
        osiProfileJson: d.osi_profile_json ?? undefined,
        ports: porPuerto.get(d.slug) ?? [],
        relations: porRelacion.get(d.slug) ?? [],
        assertions: porAfirmacion.get(d.slug) ?? [],
        attributeValues: (porValor.get(d.slug) ?? []).map((v) => ({ key: v.key, display: v.display })),
        datasheets: porDatasheet.get(d.slug) ?? [],
      })),
      catalogs: {
        protocols: protocolos.map((p) => ({ code: p.code, name: p.name, family: p.family, osiLayer: Number(p.osi_layer) })),
        standards: estandares.map((s) => ({ org: s.org, identifier: s.identifier, title: s.title })),
        media: medios.map((m) => ({ code: m.code, kind: m.kind, name: m.name, maxSpeedMbps: m.max_speed_mbps !== null ? Number(m.max_speed_mbps) : undefined })),
        layers: capas.map((l) => ({ number: Number(l.number), nameEs: l.name_es })),
        manufacturers: fabricantes.map((m) => ({
          slug: m.slug,
          snmpEnterprise: m.snmp_enterprise !== null ? Number(m.snmp_enterprise) : undefined,
        })),
      },
      sources: fuentes.map((s) => ({
        slug: s.slug, kind: s.kind, publisher: s.publisher ?? undefined, title: s.title,
        url: s.url ?? undefined, retrievedOn: s.retrieved_on ?? undefined, authorityLevel: Number(s.authority_level),
      })),
      attributeDefinitions: definiciones.map((d) => ({
        key: d.key, labelEs: d.label_es, valueType: d.value_type, unit: d.unit ?? undefined,
        enumValues: d.enum_json ? (JSON.parse(d.enum_json) as string[]) : undefined,
        isFacet: Number(d.is_facet) === 1, isComparable: Number(d.is_comparable) === 1,
        compareRule: d.compare_rule, categoryCode: d.category_code,
      })),
    }
  }

  /**
   * + revisiones de contribuciones aceptadas. Monótona y estable para deltas.
   */
  async version(): Promise<number> {
    const filas = await this.executor.query<{ c: number }>('SELECT COUNT(*) AS c FROM device')
    const contrib = await this.executor.query<{ r: number }>(
      'SELECT COALESCE(MAX(revision), 0) AS r FROM netatlas_contribuciones',
    )
    return Number(filas[0]?.c ?? 0) + Number(contrib[0]?.r ?? 0)
  }

  async recibirContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]> {
    // Merge last-writer-wins POR ENTIDAD (§31.5 / F8A futuro): si un lote trae
    // varias revisiones de la misma entidad, solo sobrevive la más alta; y si
    // el servidor ya tiene una revisión mayor de esa entidad, la entrante se
    // descarta (de id a id, la revisión del mismo id gana).
    const dedupe = mergeLWWporEntidad(entradas)
    const aceptadas: string[] = []
    for (const e of dedupe) {
      // LWW por entidad: si ya existe una revisión mayor de la entidad, se rechaza.
      const existente = await this.executor.query<{ revision: number }>(
        'SELECT revision FROM netatlas_contribuciones WHERE entidad = ?',
        [e.entidad],
      )
      if (existente[0] && Number(existente[0].revision) >= e.revision) continue
      await this.executor.exec(
        `INSERT INTO netatlas_contribuciones (id, tipo, entidad, autor, payload_json, received_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, received_at = excluded.received_at`,
        [e.id, e.tipo, e.entidad, e.autor, JSON.stringify(e.payload), e.createdAt, e.revision],
      )
      aceptadas.push(e.id)
    }
    return aceptadas
  }
}