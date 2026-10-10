import type { OutboxEntry, OutboxRepository, ReplicaRepository, SyncDevice } from '@netatlas/domain'

/**
 * Adaptadores in-memory de la sincronización local-first (F8A, §23.4[3]):
 * cola outbox y réplica del catálogo persistidas en localStorage con el mismo
 * contrato que los adaptadores SQLite. Toda persistencia es best-effort y se
 * registra con contexto si falla (nunca en silencio).
 */

const claveOutbox = 'netatlas.sync.outbox.v1'
const claveReplica = 'netatlas.sync.replica.v1'

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Fila válida de la outbox: los campos del contrato, no solo JSON forma. */
function esOutboxEntry(v: unknown): v is OutboxEntry {
  if (!esObjeto(v)) return false
  return (
    typeof v.id === 'string' &&
    typeof v.entidad === 'string' &&
    v.entidad.trim().length > 0 &&
    typeof v.autor === 'string' &&
    v.autor.trim().length > 0 &&
    typeof v.createdAt === 'string' &&
    Number.isInteger(v.revision) &&
    (v.revision as number) >= 1 &&
    esObjeto(v.payload) &&
    (v.tipo === 'nota' || v.tipo === 'propuesta-correccion' || v.tipo === 'propuesta-entity') &&
    (v.status === 'pendiente' || v.status === 'enviada')
  )
}

/** Fila válida de la réplica: mismo mapa que viaja en el snapshot del servidor. */
function esSyncDevice(v: unknown): v is SyncDevice {
  if (!esObjeto(v)) return false
  return (
    typeof v.slug === 'string' &&
    typeof v.name === 'string' &&
    typeof v.manufacturerSlug === 'string' &&
    typeof v.categoryCode === 'string' &&
    typeof v.lifecycleStatus === 'string' &&
    typeof v.updatedAt === 'string' &&
    typeof v.version === 'number'
  )
}

/**
 * Lee una lista persistida validando cada fila: JSON roto → respaldo;
 * filas con forma inesperada → se descartan (una a una) y se registra,
 * sin tratar datos crudos como si fueran del tipo del contrato.
 */
function leerLista<T>(key: string, fallback: readonly T[], esFila: (v: unknown) => v is T): readonly T[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch (error) {
    console.warn('[WARN] no se pudo leer el valor persistido; se usa el respaldo', { key, error })
    return fallback
  }
  if (!raw) return fallback

  let parseado: unknown
  try {
    parseado = JSON.parse(raw)
  } catch (error) {
    console.warn('[WARN] JSON ilegible en localStorage; se usa el respaldo', { key, error })
    return fallback
  }
  if (!Array.isArray(parseado)) {
    console.warn('[WARN] se esperaba una lista JSON; se usa el respaldo', { key, valor: parseado })
    return fallback
  }
  const validas = parseado.filter(esFila)
  if (validas.length !== parseado.length) {
    console.warn('[WARN] filas con forma inválida descartadas de la persistencia', {
      key,
      descartadas: parseado.length - validas.length,
    })
  }
  return validas
}

function guardarJson(key: string, valor: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(valor))
  } catch (error) {
    // Persistencia best-effort (cola y réplica): no bloquea el ciclo, pero el
    // fallo queda registrado con contexto en lugar de silenciado.
    console.warn('[WARN] no se pudo persistir; el dato vive solo en memoria', { key, error })
  }
}

/** Outbox in-memory (localStorage): mismo contrato que SqliteOutboxRepository. */
export class OutboxLocalRepo implements OutboxRepository {
  async enqueue(entry: OutboxEntry): Promise<void> {
    const actuales = leerLista(claveOutbox, [], esOutboxEntry)
    if (actuales.some((e) => e.id === entry.id)) return
    guardarJson(claveOutbox, [...actuales, entry])
  }

  async pendientes(): Promise<readonly OutboxEntry[]> {
    return leerLista(claveOutbox, [], esOutboxEntry).filter((e) => e.status === 'pendiente')
  }

  async marcarEnviadas(ids: readonly string[]): Promise<void> {
    const actuales = leerLista(claveOutbox, [], esOutboxEntry).map((e) =>
      ids.includes(e.id) ? { ...e, status: 'enviada' as const } : e,
    )
    guardarJson(claveOutbox, actuales)
  }

  async ultimaRevision(): Promise<number> {
    const actuales = leerLista(claveOutbox, [], esOutboxEntry)
    return Math.max(0, ...actuales.map((e) => e.revision))
  }

  /** Última aportación encolada de una entidad (para el merge LWW). */
  async ultimaModificacionEntidad(entidad: string): Promise<string | undefined> {
    const fechas = leerLista(claveOutbox, [], esOutboxEntry)
      .filter((e) => e.entidad === entidad)
      .map((e) => e.createdAt)
    return fechas.sort().at(-1)
  }
}

/** Réplica in-memory (localStorage): mismos campos que la réplica SQLite. */
export class ReplicaLocalRepo implements ReplicaRepository {
  async version(): Promise<number> {
    const rows = leerLista(claveReplica, [], esSyncDevice)
    return Math.max(0, ...rows.map((d) => d.version))
  }

  async aplicarDevices(dispositivos: readonly SyncDevice[]): Promise<{ aplicados: number; version: number }> {
    const actuales = new Map(leerLista(claveReplica, [], esSyncDevice).map((d) => [d.slug, d]))
    let aplicados = 0
    for (const d of dispositivos) {
      const previo = actuales.get(d.slug)
      if (!previo || d.version > previo.version) {
        actuales.set(d.slug, d)
        aplicados++
      }
    }
    guardarJson(claveReplica, [...actuales.values()])
    return { aplicados, version: await this.version() }
  }

  async count(): Promise<number> {
    return leerLista(claveReplica, [], esSyncDevice).length
  }
}
