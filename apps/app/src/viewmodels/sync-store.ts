import { create } from 'zustand'
import { crearOutboxEntry, sincronizar, type OutboxEntry } from '@netatlas/domain'
import { HttpSyncServer } from '@netatlas/server/sync-http'
import { OutboxLocalRepo, ReplicaLocalRepo } from './sync-repos-local.js'

/**
 * Sincronización local-first en la UI (F8A, §23.4[3]).
 *
 * La PWA (adaptadores in-memory) mantiene la cola outbox y la réplica en
 * localStorage con el MISMO contrato del dominio que los adaptadores SQLite
 * (ver `sync-repos-local.ts`); `sincronizar()` orquesta pull(push) contra el
 * servidor por HTTP. Sin red, la cola permanece (criterio F8A).
 */

const claveServidor = 'netatlas.sync.server.v1'
const claveToken = 'netatlas.sync.token.v1'

const servidorPorDefecto = 'http://127.0.0.1:8787'

/**
 * Escribe/borra una clave de configuración. Si el navegador rechaza la
 * escritura se registra y se devuelve el aviso: el valor queda solo en memoria
 * y el usuario tiene que enterarse, no descubrirlo al recargar.
 */
function guardarClave(clave: string, valor: string | null): string | undefined {
  try {
    if (valor === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
    return undefined
  } catch (error) {
    console.warn('[WARN] no se pudo persistir la configuración de sincronización', { clave, error })
    return 'No se pudo guardar la configuración en el navegador: se perderá al recargar.'
  }
}

export interface SyncEnviados {
  readonly replicados: number
  readonly versionReplica: number
  readonly contribucionesEnviadas: number
  readonly contribucionesPendientes: number
  /** false = pull de catálogo sin red/servidor (la réplica conserva versión). */
  readonly pullOk: boolean
  /** false = push de la cola falló (queda pendiente para el siguiente ciclo). */
  readonly pushOk: boolean
}

interface SyncState {
  readonly serverUrl: string
  readonly token?: string
  readonly outbox: readonly OutboxEntry[]
  readonly replicaCount: number
  readonly ultimoResultado?: SyncEnviados
  readonly error?: string
  /** Fallo al leer o escribir la configuración del servidor (no el ciclo de sync). */
  readonly configError?: string
  readonly pensando: boolean
  setServerUrl(url: string): void
  setToken(token: string): void
  /** Encola una contribución local (nota o propuesta). */
  encolar(tipo: OutboxEntry['tipo'], entidad: string, payload: Readonly<Record<string, unknown>>): Promise<void>
  /** Orquesta un ciclo sincronizar() contra el servidor configurado. */
  sincronizarAhora(): Promise<void>
  refrescar(): void
}

function leerEstado(): { serverUrl: string; token?: string; configError?: string } {
  try {
    return {
      serverUrl: localStorage.getItem(claveServidor) ?? servidorPorDefecto,
      token: localStorage.getItem(claveToken) ?? undefined,
    }
  } catch (error) {
    // Sin almacenamiento accesible: se arranca con la configuración por defecto,
    // pero la UI dice que la guardada no se pudo leer en vez de dar por bueno
    // que el usuario nunca configuró nada.
    console.warn('[WARN] localStorage no accesible; se usa el servidor por defecto', { error })
    return {
      serverUrl: servidorPorDefecto,
      configError: 'No se pudo leer la configuración guardada: se usa el servidor por defecto.',
    }
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  ...leerEstado(),
  outbox: [],
  replicaCount: 0,
  pensando: false,

  setServerUrl(url: string) {
    set({ serverUrl: url, configError: guardarClave(claveServidor, url) })
  },

  setToken(token: string) {
    const limpio = token.trim()
    set({ token: limpio || undefined, configError: guardarClave(claveToken, limpio || null) })
  },

  async encolar(tipo, entidad, payload) {
    try {
      const repo = new OutboxLocalRepo()
      const revision = (await repo.ultimaRevision()) + 1
      const entry = crearOutboxEntry(
        { tipo, entidad, autor: 'usuario-local', payload: { ...payload }, revision },
        `local-${Date.now().toString(36)}-${revision}`,
        new Date().toISOString(),
      )
      await repo.enqueue(entry)
      get().refrescar()
    } catch (err) {
      // Entrada inválida o almacenamiento caído: se registra y se comunica en
      // la UI (role="alert"), sin dejar la promesa rechazada sin atender.
      console.error('[ERROR] no se pudo encolar la contribución', { tipo, entidad, err })
      set({ error: `No se pudo encolar la contribución: ${err instanceof Error ? err.message : String(err)}` })
    }
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
      try {
        const repo = new OutboxLocalRepo()
        const replica = new ReplicaLocalRepo()
        set({
          outbox: await repo.pendientes(),
          replicaCount: await replica.count(),
        })
      } catch (err) {
        // Lectura local fallida: se registra y se comunica en la UI.
        console.error('[ERROR] no se pudo leer la cola local ni la réplica', { err })
        set({ error: `No se pudo leer el estado local: ${err instanceof Error ? err.message : String(err)}` })
      }
    })()
  },
}))