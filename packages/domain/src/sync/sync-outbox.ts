/**
 * Cola de contribuciones locales (outbox pattern, §23.4[3], F8A): las
 * contribuciones pendientes se encolan y se suben cuando hay red; el merge
 * last-writer-wins por entidad decide qué revisiones sobreviven.
 */

export type TipoContribucion = 'nota' | 'propuesta-correccion' | 'propuesta-entity'

export interface OutboxEntry {
  readonly id: string
  readonly tipo: TipoContribucion
  /** Entidad objetivo (device:slug, glossary:slug, …). */
  readonly entidad: string
  /** Slug del usuario/autor (local-first; el servidor valida). */
  readonly autor: string
  /** Payload JSON-safe con la corrección/nota (datos, nunca código). */
  readonly payload: Readonly<Record<string, unknown>>
  readonly createdAt: string
  /** Monótono por cliente: para last-writer-wins y merge dedup. */
  readonly revision: number
  readonly status: 'pendiente' | 'enviada'
}

export interface CrearOutboxInput {
  readonly tipo: TipoContribucion
  readonly entidad: string
  readonly autor: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly revision: number
}

export function crearOutboxEntry(input: CrearOutboxInput, id: string, now: string): OutboxEntry {
  if (input.entidad.trim().length === 0) {
    throw new Error('OutboxEntry: entidad no puede estar vacía.')
  }
  if (input.autor.trim().length === 0) {
    throw new Error('OutboxEntry: autor no puede estar vacío.')
  }
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('OutboxEntry: revision debe ser entero ≥ 1.')
  }
  return {
    id,
    tipo: input.tipo,
    entidad: input.entidad,
    autor: input.autor,
    payload: Object.freeze({ ...input.payload }),
    createdAt: now,
    revision: input.revision,
    status: 'pendiente',
  }
}

/** Almacén local de la cola de contribuciones (outbox pattern, §23.4[3]). */
export interface OutboxRepository {
  /** Encola una contribución pendiente. */
  enqueue(entry: OutboxEntry): Promise<void>
  /** Contribuciones aún no enviadas (orden por createdAt). */
  pendientes(): Promise<readonly OutboxEntry[]>
  /** Marca como enviadas (solo si el servidor confirmó recepción). */
  marcarEnviadas(ids: readonly string[]): Promise<void>
  /** Última revisión usada (para asignar la siguiente). */
  ultimaRevision(): Promise<number>
  /** Última fecha de herramienta de entidad (para last-writer-wins). */
  ultimaModificacionEntidad(entidad: string): Promise<string | undefined>
}

/**
 * Merge last-writer-wins por ENTIDAD (§31.5 / F8A futuro): dado un lote de
 * contribuciones entrantes, resuelve la revisión más alta por entidad objetivo
 * y devuelve las que deben persistirse (las revisiones inferiores a la máxima
 * de su entidad se descartan — el cliente cree id empírico, revisión monotónica).
 *
 * Puro y testeable: un adaptador del servidor puede delegar la decisión aquí.
 */
export function mergeLWWporEntidad(entradas: readonly OutboxEntry[]): readonly OutboxEntry[] {
  const mejorPorEntidad = new Map<string, OutboxEntry>()
  for (const e of entradas) {
    const previa = mejorPorEntidad.get(e.entidad)
    if (!previa || e.revision > previa.revision) mejorPorEntidad.set(e.entidad, e)
  }
  // Salida determinista: orden por entidad (no por orden de llegada).
  return [...mejorPorEntidad.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, e]) => e)
}