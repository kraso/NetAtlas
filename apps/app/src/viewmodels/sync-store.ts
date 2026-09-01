import { create } from 'zustand'
import { crearOutboxEntry, sincronizar } from '@netatlas/domain'
import type { OutboxEntry, OutboxRepository, ReplicaRepository, SyncDevice } from '@netatlas/domain'
import { HttpSyncServer } from '@netatlas/server/sync-http'

/**
 * Sincronización local-first en la UI (F8A, §23.4[3]).
 *
 * La PWA (adaptadores in-memory) mantiene la cola outbox y la réplica en
 * localStorage con el MISMO contrato del dominio que los adaptadores SQLite;
 * `sincronizar()` orquesta pull(push) contra el servidor por HTTP. Sin red,
 * la cola permanece (criterio F8A).
 */

const K_OUTBOX = 'netatlas.sync.outbox.v1'
const K_REPLICA = 'netatlas.sync.replica.v1'
const K_SERVER = 'netatlas.sync.server.v1'
const K_TOKEN = 'netatlas.sync.token.v1'

const DEFAULT_SERVER = 'http://127.0.0.1:8787'

function leerJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function guardarJson(key: string, valor: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento: no persiste pero no falla.
  }
}

/** Outbox in-memory (localStorage): mismo contrato que SqliteOutboxRepository. */
export class OutboxLocalRepo implements OutboxRepository {
  async enqueue(entry: OutboxEntry): Promise<void> {
    const actuales = leerJson<OutboxEntry[]>(K_OUTBOX, [])
    if (actuales.some((e) => e.id === entry.id)) return
    guardarJson(K_OUTBOX, [...actuales, entry])
  }

  async pendientes(): Promise<readonly OutboxEntry[]> {
    return leerJson<OutboxEntry[]>(K_OUTBOX, []).filter((e) => e.status === 'pendiente')
  }

  async marcarEnviadas(ids: readonly string[]): Promise<void> {
    const actuales = leerJson<OutboxEntry[]>(K_OUTBOX, []).map((e) =>
      ids.includes(e.id) ? { ...e, status: 'enviada' as const } : e,
    )
    guardarJson(K_OUTBOX, actuales)
  }

  async ultimaRevision(): Promise<number> {
    const actuales = leerJson<OutboxEntry[]>(K_OUTBOX, [])
    return Math.max(0, ...actuales.map((e) => e.revision))
  }

  async ultimaModificacionEntidad(_entidad: string): Promise<string | undefined> {
    return undefined
  }
}

/** Réplica in-memory (localStorage): mismos campos que la réplica SQLite. */
export class ReplicaLocalRepo implements ReplicaRepository {
  async version(): Promise<number> {
    const rows = leerJson<SyncDevice[]>(K_REPLICA, [])
    return Math.max(0, ...rows.map((d) => d.version))
  }

  async aplicarDevices(dispositivos: readonly SyncDevice[]): Promise<{ aplicados: number; version: number }> {
    const actuales = new Map(leerJson<SyncDevice[]>(K_REPLICA, []).map((d) => [d.slug, d]))
    let aplicados = 0
    for (const d of dispositivos) {
      const previo = actuales.get(d.slug)
      if (!previo || d.version > previo.version) {
        actuales.set(d.slug, d)
        aplicados++
      }
    }
    guardarJson(K_REPLICA, [...actuales.values()])
    return { aplicados, version: await this.version() }
  }

  async count(): Promise<number> {
    return leerJson<SyncDevice[]>(K_REPLICA, []).length
  }
}

export interface SyncEnviados {
  readonly replicados: number
  readonly versionReplica: number
  readonly contribucionesEnviadas: number
  readonly contribucionesPendientes: number
}

interface SyncState {
  readonly serverUrl: string
  readonly token?: string
  readonly outbox: readonly OutboxEntry[]
  readonly replicaCount: number
  readonly ultimoResultado?: SyncEnviados
  readonly error?: string
  readonly pensando: boolean
  setServerUrl(url: string): void
  setToken(token: string): void
  /** Encola una contribución local (nota o propuesta). */
  encolar(tipo: OutboxEntry['tipo'], entidad: string, payload: Readonly<Record<string, unknown>>): Promise<void>
  /** Orquesta un ciclo sincronizar() contra el servidor configurado. */
  sincronizarAhora(): Promise<void>
  refrescar(): void
}

function leerEstado(): { serverUrl: string; token?: string } {
  return {
    serverUrl: localStorage.getItem(K_SERVER) ?? DEFAULT_SERVER,
    token: localStorage.getItem(K_TOKEN) ?? undefined,
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  ...leerEstado(),
  outbox: [],
  replicaCount: 0,
  pensando: false,

  setServerUrl(url: string) {
    localStorage.setItem(K_SERVER, url)
    set({ serverUrl: url })
  },

  setToken(token: string) {
    if (token.trim()) localStorage.setItem(K_TOKEN, token.trim())
    else localStorage.removeItem(K_TOKEN)
    set({ token: token.trim() || undefined })
  },

  async encolar(tipo, entidad, payload) {
    const repo = new OutboxLocalRepo()
    const revision = (await repo.ultimaRevision()) + 1
    const entry = crearOutboxEntry(
      { tipo, entidad, autor: 'usuario-local', payload: { ...payload }, revision },
      `local-${Date.now().toString(36)}-${revision}`,
      new Date().toISOString(),
    )
    await repo.enqueue(entry)
    get().refrescar()
  },

  async sincronizarAhora() {
    if (get().pensando) return
    set({ pensando: true, error: undefined })
    try {
      const outbox = new OutboxLocalRepo()
      const replica = new ReplicaLocalRepo()
      const servidor = new HttpSyncServer(get().serverUrl, get().token)
      const resultado = await sincronizar(outbox, servidor, replica)
      set({ ultimoResultado: resultado, pensando: false })
      get().refrescar()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), pensando: false })
    }
  },

  refrescar() {
    void (async () => {
      const repo = new OutboxLocalRepo()
      const replica = new ReplicaLocalRepo()
      set({
        outbox: await repo.pendientes(),
        replicaCount: await replica.count(),
      })
    })()
  },
}))