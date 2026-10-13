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
// Cada fase del pull vive en `http-ui-*.ts` (pull, mapeo, relaciones,
// trazabilidad, recursos).
import {
  type InMemoryDataset,
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
import type { AppServices } from '../composition-root.js'
import { DEFAULT_API } from './http-ui-tipos.js'
import { pullCategorias, pullSnapshot } from './http-ui-pull.js'
import { construirDataset } from './http-ui-dataset.js'

/**
 * Pull del API server (F8B) → InMemoryDataset minimal.
 * El dataset demo (6 devices) se usa como fallback si la red falla (offline-first F8A).
 */
export async function fetchDatasetRemoto(apiBase: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<InMemoryDataset> {
  const body = await pullSnapshot(apiBase, fetchImpl)
  const categoriasApi = await pullCategorias(apiBase, fetchImpl)
  return construirDataset(body, categoriasApi)
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
