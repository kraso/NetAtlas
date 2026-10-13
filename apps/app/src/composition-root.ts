import { create } from 'zustand'
// Los tipos del adaptador viajan en la misma declaración que los valores
// (`type` inline): el límite de cinco imports por fichero cuenta declaraciones.
import {
  InMemoryDeviceRepository,
  InMemoryCatalogRepository,
  InMemorySearchIndex,
  InMemoryGraphRepository,
  InMemorySourcingRepository,
  InMemoryAttributesRepository,
  InMemoryTopologyRepository,
  InMemoryQualityRepository,
  buildDemoDataset,
  UiAssistantRepoDemo,
  type InMemoryDataset,
} from './adapters/in-memory.js'
import { HttpUiRepos } from './adapters/http-ui.js'
import type { AppServices } from './composition-root-contratos.js'

// Los contratos que consumen las vistas viven aparte: esta composition root se
// queda con el cableado, y ambos módulos caben bajo el límite de 200 líneas.
export type * from './composition-root-contratos.js'

/**
 * Resuelve los servicios de la app según el entorno (hexagonal §6):
 * - Browser/PWA (F1): dataset demo en memoria (offline, 0 dependencias Node).
 * - Desktop (Electron/Tauri, F1-late): dataset real vía SQLite (wa-sqlite o node:sqlite).
 *
 * El flag `VITE_DATASET=sqlite` activa el backend real; por defecto se usa memoria.
 *
 * El flag se lee en su forma canónica (`import.meta.env.VITE_DATASET`) a
 * propósito: Vite sustituye esa expresión en build por su valor, y como el if
 * queda con una constante falsa, Rollup elimina la rama y con ella el import de
 * la composition root SQLite. Con un cast (`(import.meta.env as ...)`) la
 * sustitución no aplica, la rama sobrevive y el grafo de `@netatlas/data`
 * (marcado `external` en vite.config) acaba metiendo un `import "@netatlas/data"`
 * desnudo en el chunk de entrada, que el navegador no puede resolver: la app
 * arrancaba en blanco en el build de producción.
 */
export function resolveServices(): AppServices {
  if (import.meta.env.VITE_DATASET === 'sqlite') {
    // Lazy require: node:sqlite no existe en browser, por lo que el import de
    // composition-root-sqlite sólo se evalúa en entornos con Node runtime.
    void import('./composition-root-sqlite.js').then((mod) => mod.buildSqliteServices())
  }
  return buildServices()
}

/** URL del API server: `VITE_API` overridea el default local (para CI). */
function baseApi(): string {
  const override = import.meta.env.VITE_API
  return override !== undefined && override !== '' ? override : 'http://127.0.0.1:8787'
}

/**
 * Red caida: NO se toca el dataset actual — machacarlo borraria el demo
 * inicial, el SQLite inyectado en tests o el remoto ya warmeado (F8A).
 */
function avisarPullFallido(err: unknown): void {
  console.warn(
    '[HTTP UI] pull F8B fallido, se conserva el dataset actual:',
    err instanceof Error ? err.message : err,
  )
}

/**
 * Adaptador HTTP API server (F8B): warmeza un pull a /api/snapshot en background
 * contra el server local. El dataset remoto (330 dispositivos) reemplaza al
 * demo (6) en el store reactivo cuando llega. Si falla la red, se conserva el
 * dataset actual (offline-first F8A). El browser PWA (F1-baseline) no puede usar
 * node:sqlite; en su lugar usa el API server F8B (localhost:8787) con los 330
 * dispositivos reales. Flag VITE_API overridea la URL (para CI).
 */
let httpWarmer: Promise<void> | null = null
export function warmezaHttpSiDisponible(): Promise<void> {
  if (httpWarmer) return httpWarmer
  httpWarmer = new HttpUiRepos(baseApi())
    .buildServices()
    .then((services) => setServices(services))
    .catch(avisarPullFallido)
  return httpWarmer
}

export function buildServices(dataset?: InMemoryDataset): AppServices {
  const data = dataset ?? buildDemoDataset()
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

interface ServiceStore {
  services: AppServices
  /** Versión del dataset cargado (demo vs remoto), para re-renders. */
  revision: number
}

export const useServices = create<ServiceStore>((set) => ({
  services: resolveServices(),
  revision: 0,
}))

/** Permite a los tests inyectar un dataset controlado o el motor SQLite real. */
export function setServices(services: AppServices): void {
  useServices.setState((prev) => ({ services, revision: prev.revision + 1 }))
}
