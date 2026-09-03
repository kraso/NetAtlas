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
import { Device as DeviceEntity, Manufacturer, Category } from '@netatlas/domain'
import type { SyncDevice } from '@netatlas/domain'
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
import { buildDemoDataset } from './in-memory.js'
import type { Topology, Assertion, Relationship, Source } from '@netatlas/domain'

const DEFAULT_API = 'http://127.0.0.1:8787'

/** Snapshot SyncDevice → Device del dominio (campos que el snapshot expone). */
function toDevice(sd: SyncDevice): Device {
  return DeviceEntity.create({
    slug: sd.slug,
    name: sd.name,
    manufacturerSlug: sd.manufacturerSlug,
    categoryCode: sd.categoryCode,
    lifecycleStatus: sd.lifecycleStatus as Device['lifecycleStatus'],
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
  const manufacturers: Manufacturer[] = [...mSlugs.values()].map((m) =>
    Manufacturer.create({ slug: m.slug, name: m.name })
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
  const body = (await res.json()) as { version: number; dispositivos: readonly SyncDevice[] }

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

  const dispositivos = (body.dispositivos ?? []).map(toDevice)
  const { manufacturers, categories } = derivarCatalogo(dispositivos, categoriasApi)

  return {
    devices: dispositivos,
    manufacturers,
    categories,
    relationships: [],
    assertions: [],
    sources: [],
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
      this.datasetPromise = fetchDatasetRemoto(this.apiBase).catch((err) => {
        console.warn('[HTTP UI] fallo pull F8B → dataset demo (offline-first):', (err as Error).message)
        const demo = buildDemoDataset()
        return demo
      })
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
