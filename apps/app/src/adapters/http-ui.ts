// NetAtlas — Adaptador HTTP→UI (F8B).
//
// Pull del API server público (packages/server, §23.4[F8B]) para poblar la UI
// browser con el dataset REAL (330 dispositivos) en lugar del demo de 6.
//
// Ruta: el browser PWA no puede usar node:sqlite (F1-baseline, §F1); en su
// lugar el cliente fetch al API REST que el server expone sobre la misma DB.
// Flag `VITE_API=http://127.0.0.1:8787` activa este adaptador en `resolveServices`;
// sin flag se usa el dataset demo en memoria (offline, 6 dispositivos).
//
// Contrato: se construye un InMemoryDataset minimal (devices + manufacturers +
// categories derivados del snapshot) y se reutilizan los adaptadores in-memory
// para las vistas — cambio de motor NO toca viewmodels ni UI (hexagonal §6).
import type { Device } from '@netatlas/domain'
import {
  Assertion,
  Datasheet,
  DeviceImage,
  Device as DeviceEntity,
  Manufacturer,
  Category,
  OsiProfileValue,
  Port,
  Source,
} from '@netatlas/domain'
import type {
  SyncAssertion,
  SyncAttributeDefinition,
  SyncCatalogs,
  SyncDatasheet,
  SyncDevice,
  SyncDeviceDetail,
  SyncDeviceRelation,
  SyncPort,
  SyncSource,
} from '@netatlas/domain'
import type { InMemoryDataset } from './in-memory.js'
import {
  InMemoryDeviceRepository,
  InMemoryCatalogRepository,
  InMemorySearchIndex,
  InMemoryGraphRepository,
  InMemorySourcingRepository,
  InMemoryAttributesRepository,
  InMemoryTopologyRepository,
  InMemoryQualityRepository,
  UiAssistantRepoDemo,
} from './in-memory.js'
import type { AppServices, UiDeviceRepo, UiCatalogRepo, UiSearchRepo, UiGraphRepo, UiSourcingRepo, UiAttributesRepo, UiTopologyRepo, UiQualityRepo, UiAssistantRepo } from '../composition-root.js'
import type { Topology } from '@netatlas/domain'
import type { InMemoryAttributeDefinition, InMemoryDeviceAttributeValue } from './in-memory.js'
import { Relationship } from '@netatlas/domain'

/** Shape plano del `links[]` serializado por el API F8B (`/api/snapshot`). */
interface SnapshotLink {
  readonly from: string
  readonly to: string
  readonly predicate: string
}

const DEFAULT_API = 'http://127.0.0.1:8787'

/** Valores cerrados que el snapshot puede traer (se descartan filas ajenas). */
const SOURCE_KINDS = new Set(['datasheet', 'manual', 'rfc', 'ieee', 'web-oficial', 'libro', 'terceros', 'editorial'])
const CONFIDENCES = new Set(['official', 'derived', 'third-party', 'experimental', 'historical'])
const VALUE_TYPES = new Set(['number', 'text', 'enum', 'bool', 'range'])
const COMPARE_RULES = new Set(['higher-better', 'lower-better', 'set-compare', 'none'])
const OBJECT_TYPES = { protocol: 'protocol', standard: 'standard', layer: 'layer', medium: 'medium', device: 'device' } as const

/** Puerto del snapshot → Port (fila inválida → undefined, sin tumbar el pull). */
function toPort(p: SyncPort): Port | undefined {
  try {
    return Port.create({
      label: p.label,
      interfaceCode: p.interfaceCode,
      quantity: p.quantity,
      speedsMbps: [...p.speedsMbps],
      poeStandard: (p.poeStandard ?? undefined) as Port['poeStandard'],
      role: (p.role ?? undefined) as Port['role'],
      notes: p.notes ?? undefined,
    })
  } catch {
    return undefined
  }
}

/** Snapshot SyncDevice (+ detalle F8B-detalle) → Device del dominio. */
function toDevice(sd: SyncDevice, det?: SyncDeviceDetail): Device {
  let osiProfile = undefined
  if (det?.osiProfileJson) {
    try {
      osiProfile = OsiProfileValue.create(JSON.parse(det.osiProfileJson) as Parameters<typeof OsiProfileValue.create>[0])
    } catch {
      osiProfile = undefined
    }
  }
  return DeviceEntity.create({
    slug: sd.slug,
    name: sd.name,
    manufacturerSlug: sd.manufacturerSlug,
    categoryCode: sd.categoryCode,
    lifecycleStatus: sd.lifecycleStatus as Device['lifecycleStatus'],
    summary: det?.summary ?? undefined,
    osiProfile,
    ports: (det?.ports ?? []).flatMap((p) => {
      const port = toPort(p)
      return port ? [port] : []
    }),
  })
}

/** Deriva fabricantes y categorías únicos del snapshot (el API /api/categories
 *  también sirve categorías; aquí se fusionan ambos: nombres del API + jerarquía
 *  derivada de los códigos CAT-XXX-YYY para que el árbol UI muestre las 4
 *  macrocategorías raíz, no 26 hojas). */
function parentCodeDe(code: string): string | undefined {
  // Jerarquía implícita en el código: CAT-SWT-L3 → CAT-SWT-L2 → CAT-SWT.
  const partes = code.split('-')
  if (partes.length <= 1) return undefined
  return partes.slice(0, -1).join('-')
}

function derivarCatalogo(
  dispositivos: readonly Device[],
  categoriasApi: readonly { code: string; nameEs: string; parentCode?: string }[],
  empresasApi: readonly { slug: string; snmpEnterprise?: number | undefined }[] = [],
): { manufacturers: readonly Manufacturer[]; categories: readonly Category[] } {
  const mSlugs = new Map<string, { slug: string; name: string }>()
  const cNames = new Map<string, string>()
  for (const c of categoriasApi) cNames.set(c.code, c.nameEs)
  for (const d of dispositivos) {
    if (!mSlugs.has(d.manufacturerSlug)) mSlugs.set(d.manufacturerSlug, { slug: d.manufacturerSlug, name: d.manufacturerSlug })
    if (!cNames.has(d.categoryCode)) cNames.set(d.categoryCode, d.categoryCode)
  }
  const codes = Array.from(cNames.keys())
  const categories: Category[] = codes.map((code) => {
    const parent = parentCodeDe(code)
    // Si el padre existe en el catálogo, enlázalo; si no, root.
    const hasParent = codes.includes(parent ?? '')
    return Category.hydrate({
      code,
      nameEs: cNames.get(code) ?? code,
      parentCode: parent && hasParent ? parent : undefined,
      aliases: [],
      sortOrder: 0,
    })
  })
  const empresas = new Map(empresasApi.map((e) => [e.slug, e.snmpEnterprise]))
  const manufacturers: Manufacturer[] = [...mSlugs.values()].map((m) =>
    Manufacturer.create({ slug: m.slug, name: m.name, snmpEnterprise: empresas.get(m.slug) ?? undefined })
  )
  return { manufacturers, categories }
}

/**
 * Pull del API server (F8B) → InMemoryDataset minimal.
 * El dataset demo (6 devices) se usa como fallback si la red falla (offline-first F8A).
 */
export async function fetchDatasetRemoto(apiBase: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<InMemoryDataset> {
  const token = import.meta.env.VITE_API_TOKEN
  const headers: Record<string, string> = {}
  if (token) headers['authorization'] = `Bearer ${token}`

  const res = await fetchImpl(`${apiBase}/api/snapshot?since=0`, { headers })
  if (!res.ok) {
    throw new Error(`API F8B /api/snapshot devolvió HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    version: number
    dispositivos: readonly SyncDevice[]
    links?: readonly SnapshotLink[]
    detalle?: {
      devices: readonly SyncDeviceDetail[]
      catalogs: SyncCatalogs
      sources: readonly SyncSource[]
      attributeDefinitions: readonly SyncAttributeDefinition[]
    }
  }

  let categoriasApi: readonly { code: string; nameEs: string; parentCode?: string }[] = []
  try {
    const cr = await fetchImpl(`${apiBase}/api/categories`, { headers })
    if (cr.ok) {
      const cb = (await cr.json()) as { categorias: readonly { code: string; nameEs: string; parentCode?: string }[] }
      categoriasApi = cb.categorias ?? []
    }
  } catch {
    /* /api/categories caído → deriva categorías del snapshot */
  }

  const detPorSlug = new Map((body.detalle?.devices ?? []).map((d) => [d.slug, d]))
  const dispositivos = (body.dispositivos ?? []).map((sd) => toDevice(sd, detPorSlug.get(sd.slug)))
  const { manufacturers, categories } = derivarCatalogo(dispositivos, categoriasApi, body.detalle?.catalogs.manufacturers)
  // Aristas de topología device-device (snapshot F8B). Se normalizan a
  // `Relationship` con predicate `compatible-with` (simétrico device↔device;
  // validado en el dominio). `Relationship.create` requiere que ambos slugs
  // existan en el dataset; los que apuntan a un device desconocido se descartan.
  const rels: Relationship[] = []
  const known = new Set(dispositivos.map((d) => d.slug.value))
  for (const l of body.links ?? []) {
    if (l.from === l.to) continue
    if (!known.has(l.from) || !known.has(l.to)) continue
    try {
      rels.push(
        Relationship.create({
          subject: { type: 'device', slug: l.from },
          predicate: 'compatible-with',
          object: { type: 'device', slug: l.to },
          validFrom: '1970-01-01',
        }),
      )
    } catch {
      // predicate inválido o nodo no existe → descartar.
    }
  }
  // Aristas de catálogo del detalle (protocolos, capas, estándares, medios).
  // El objeto viaja por código; se valida tipo y predicado en dominio.
  for (const d of body.detalle?.devices ?? []) {
    if (!known.has(d.slug)) continue
    for (const r of d.relations) {
      const objectType = OBJECT_TYPES[r.objectType as keyof typeof OBJECT_TYPES]
      if (!objectType) continue
      try {
        rels.push(
          Relationship.create({
            subject: { type: 'device', slug: d.slug },
            predicate: r.predicate,
            object: { type: objectType, slug: r.objectCode },
            validFrom: '1970-01-01',
          }),
        )
      } catch {
        // predicado/tipo fuera de catálogo → descartar fila sin tumbar el pull.
      }
    }
  }

  // Fuentes (una por slug; filas inválidas se descartan).
  const fuentes = new Map<string, Source>()
  for (const s of body.detalle?.sources ?? []) {
    try {
      if (!SOURCE_KINDS.has(s.kind)) continue
      if (s.authorityLevel !== 1 && s.authorityLevel !== 2 && s.authorityLevel !== 3 && s.authorityLevel !== 4) continue
      fuentes.set(
        s.slug,
        Source.create({
          slug: s.slug,
          kind: s.kind as Source['kind'],
          publisher: s.publisher ?? undefined,
          title: s.title,
          url: s.url ?? undefined,
          retrievedOn: s.retrievedOn ?? undefined,
          authorityLevel: s.authorityLevel,
        }),
      )
    } catch {
      // fuente inválida → las assertions que la citen se descartan abajo.
    }
  }

  // Afirmaciones: subjectId in-memory = índice del dispositivo + 1 (mismo
  // convenio que InMemorySourcingRepository.assertionsForDevice).
  const afirmaciones: Assertion[] = []
  dispositivos.forEach((dev, i) => {
    const det = detPorSlug.get(dev.slug.value)
    if (!det) return
    for (const a of det.assertions) {
      try {
        const fuente = fuentes.get(a.sourceSlug)
        if (!fuente || !CONFIDENCES.has(a.confidence)) continue
        afirmaciones.push(
          Assertion.create({
            subjectType: 'device',
            subjectId: i + 1,
            predicate: a.predicate,
            valueJson: a.valueJson,
            source: fuente,
            confidence: a.confidence as Assertion['confidence'],
            verifiedOn: a.verifiedOn,
            author: a.author,
            reviewedBy: a.reviewedBy ?? undefined,
            note: a.note ?? undefined,
          }),
        )
      } catch {
        // afirmación inválida (fecha no ISO, etc.) → descartar fila.
      }
    }
  })

  // EAV: definiciones globales + valores con display ya calculado en servidor.
  const attributeDefinitions: InMemoryAttributeDefinition[] = []
  for (const d of body.detalle?.attributeDefinitions ?? []) {
    if (!VALUE_TYPES.has(d.valueType) || !COMPARE_RULES.has(d.compareRule)) continue
    attributeDefinitions.push({
      key: d.key,
      labelEs: d.labelEs,
      valueType: d.valueType as InMemoryAttributeDefinition['valueType'],
      unit: d.unit ?? undefined,
      enumValues: d.enumValues ? [...d.enumValues] : undefined,
      isFacet: d.isFacet,
      isComparable: d.isComparable,
      compareRule: d.compareRule as InMemoryAttributeDefinition['compareRule'],
      categoryCode: d.categoryCode,
    })
  }
  const deviceAttributeValues: InMemoryDeviceAttributeValue[] = (body.detalle?.devices ?? []).flatMap((d) =>
    known.has(d.slug) ? d.attributeValues.map((v) => ({ deviceSlug: d.slug, key: v.key, display: v.display })) : [],
  )

  // Datasheets (F2-Documentación): una fila inválida no tumba el pull.
  const imagenes: DeviceImage[] = []
  dispositivos.forEach((dev) => {
    const det = detPorSlug.get(dev.slug.value)
    if (!det) return
    for (const g of det.images ?? []) {
      try {
        const fuente = fuentes.get(g.sourceSlug)
        if (!fuente || (g.kind !== 'frontal' && g.kind !== 'trasera' && g.kind !== 'lateral' && g.kind !== 'interior' && g.kind !== 'panel')) continue
        imagenes.push(
          DeviceImage.create({
            deviceSlug: dev.slug.value,
            kind: g.kind,
            caption: g.caption ?? undefined,
            localPath: g.localPath ?? undefined,
            url: g.url ?? undefined,
            source: fuente,
          }),
        )
      } catch {
        // imagen inválida → descartar fila.
      }
    }
  })
  const fichas: Datasheet[] = []
  dispositivos.forEach((dev) => {
    const det = detPorSlug.get(dev.slug.value)
    if (!det) return
    for (const f of det.datasheets ?? []) {
      try {
        const fuente = fuentes.get(f.sourceSlug)
        if (!fuente) continue
        fichas.push(
          Datasheet.create({
            deviceSlug: dev.slug.value,
            title: f.title,
            language: f.language,
            url: f.url ?? undefined,
            localPath: f.localPath ?? undefined,
            source: fuente,
          }),
        )
      } catch {
        // ficha inválida (idioma no ISO, URL no http…) → descartar fila.
      }
    }
  })

  const catalogs = body.detalle?.catalogs
  return {
    devices: dispositivos,
    manufacturers,
    categories,
    relationships: rels,
    assertions: afirmaciones,
    sources: [...fuentes.values()],
    protocols: (catalogs?.protocols ?? []).map((p) => ({ ...p })),
    standards: (catalogs?.standards ?? []).map((s) => ({ ...s })),
    media: (catalogs?.media ?? []).map((m) => ({ ...m })),
    attributeDefinitions,
    deviceAttributeValues,
    datasheets: fichas,
    images: imagenes,
  }
}

/** Adaptador UI sobre HTTP API server — reutiliza los adaptadores in-memory
 *  sobre el dataset remoto. Si el pull falla, cae al dataset demo (6). */
export class HttpUiRepos {
  private readonly apiBase: string
  private datasetPromise: Promise<InMemoryDataset> | null = null

  constructor(apiBase: string = DEFAULT_API) {
    this.apiBase = apiBase
  }

  private dataset(): Promise<InMemoryDataset> {
    if (!this.datasetPromise) {
      // Sin fallback a demo aqui: si el pull falla, el rechazo sube al llamador
      // (warmezaHttpSiDisponible), que conserva el dataset actual. Tragarlo aqui
      // con demo SOBREESCRIBIRIA servicios ya inyectados (p.ej. SQLite en tests).
      this.datasetPromise = fetchDatasetRemoto(this.apiBase)
    }
    return this.datasetPromise
  }

  async buildServices(): Promise<AppServices> {
    const data = await this.dataset()
    return {
      devices: new InMemoryDeviceRepository(data),
      catalog: new InMemoryCatalogRepository(data),
      search: new InMemorySearchIndex(data),
      graph: new InMemoryGraphRepository(data),
      sourcing: new InMemorySourcingRepository(data),
      attributes: new InMemoryAttributesRepository(data),
      topologies: new InMemoryTopologyRepository(data),
      quality: new InMemoryQualityRepository(data),
      asistente: new UiAssistantRepoDemo(data),
      dataset: data,
    }
  }

  /** Dispara el pull sin bloquear (usa el demo hasta que termine). */
  warmezar(): void {
    void this.dataset()
  }
}

/**
 * Hook reactivo: si VITE_API está configurado, el browser usa el dataset
 * REAL del API server (330 dispositivos); si no, el demo de 6 (offline).
 */
export function resolveHttpServices(): AppServices | null {
  const apiBase = (import.meta.env as Record<string, unknown>).VITE_API as string | undefined
  if (!apiBase) return null
  // En SSR/hidratación inicial se devuelve el demo; el pull async lo reemplaza.
  return null
}
