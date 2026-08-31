import { create } from 'zustand'
import {
  InMemoryDeviceRepository,
  InMemoryCatalogRepository,
  InMemorySearchIndex,
  buildDemoDataset,
} from './adapters/in-memory.js'
import type { InMemoryDataset } from './adapters/in-memory.js'

/**
 * Composition root de la UI (F1).
 * Cablea los adaptadores in-memory (navegador/tests). En F1-late,
 * wa-sqlite + repositorios SQLite sustituyen estos adaptadores sin tocar
 * viewmodels ni vistas (mismo contrato de puertos).
 */
export interface AppServices {
  readonly devices: InMemoryDeviceRepository
  readonly catalog: InMemoryCatalogRepository
  readonly search: InMemorySearchIndex
  readonly dataset: InMemoryDataset
}

export function buildServices(dataset?: InMemoryDataset): AppServices {
  const data = dataset ?? buildDemoDataset()
  return {
    devices: new InMemoryDeviceRepository(data),
    catalog: new InMemoryCatalogRepository(data),
    search: new InMemorySearchIndex(data),
    dataset: data,
  }
}

interface ServiceStore {
  services: AppServices
}

export const useServices = create<ServiceStore>(() => ({
  services: buildServices(),
}))

/** Permite a los tests inyectar un dataset controlado antes de renderizar. */
export function setServices(services: AppServices): void {
  useServices.setState({ services })
}