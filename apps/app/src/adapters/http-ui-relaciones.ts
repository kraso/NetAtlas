import { claveArista, esFuenteSintetica, Relationship } from '@netatlas/domain'
import type { SnapshotBody } from './http-ui-tipos.js'
import { OBJECT_TYPES } from './http-ui-tipos.js'

/** Aristas del pull + claves de las que SOLO constan por fuente sintética. */
export interface RelacionesDelPull {
  readonly relaciones: readonly Relationship[]
  readonly sinteticas: ReadonlySet<string>
}

/**
 * Aristas del snapshot → `Relationship` (dominio valida predicado y tipos).
 * Se descartan las filas que apuntan a entidades desconocidas o usan
 * predicados fuera de catálogo — nunca tumban el pull. Las aristas cuya única
 * fuente es sintética (importación asistida) se marcan por `claveArista`: la
 * métrica de cobertura crítica debe ignorarlas.
 */
export function construirRelaciones(body: SnapshotBody, known: ReadonlySet<string>): RelacionesDelPull {
  // Aristas device↔device (snapshot) y aristas de catálogo del detalle; ambas
  // se normalizan a `Relationship` (simétrico device↔device validado en dominio).
  const candidatas = [...aristasDeTopologia(body, known), ...aristasDeCatalogo(body, known)]
  const relaciones: Relationship[] = []
  const curadas = new Set<string>()
  const sinteticas = new Set<string>()
  for (const c of candidatas) {
    const rel = crearRelacion(c)
    if (!rel) continue
    relaciones.push(rel)
    const clave = claveArista(rel)
    if (esFuenteSintetica(c.sourceSlug ?? '')) sinteticas.add(clave)
    else curadas.add(clave)
  }
  // Una arista confirmada también por fuente curada NO es sintética.
  for (const clave of curadas) sinteticas.delete(clave)
  return { relaciones, sinteticas }
}

/** Arista candidata antes de crear la `Relationship` validada. */
interface AristaCandidata {
  readonly subject: Relationship['subject']
  readonly predicate: string
  readonly object: Relationship['object']
  readonly sourceSlug?: string | undefined
}

/** Aristas de topología del snapshot (nodos desconocidos → descartadas). */
function aristasDeTopologia(body: SnapshotBody, known: ReadonlySet<string>): AristaCandidata[] {
  const aristas: AristaCandidata[] = []
  for (const l of body.links ?? []) {
    if (l.from === l.to || !known.has(l.from) || !known.has(l.to)) continue
    aristas.push({ subject: { type: 'device', slug: l.from }, predicate: 'compatible-with', object: { type: 'device', slug: l.to } })
  }
  return aristas
}

/** Aristas de catálogo del detalle (tipo/predicado fuera de catálogo → fuera). */
function aristasDeCatalogo(body: SnapshotBody, known: ReadonlySet<string>): AristaCandidata[] {
  const aristas: AristaCandidata[] = []
  for (const d of body.detalle?.devices ?? []) {
    if (!known.has(d.slug)) continue
    for (const r of d.relations) {
      const objectType = OBJECT_TYPES[r.objectType as keyof typeof OBJECT_TYPES]
      if (!objectType) continue
      aristas.push({
        subject: { type: 'device', slug: d.slug },
        predicate: r.predicate,
        object: { type: objectType, slug: r.objectCode },
        sourceSlug: r.sourceSlug,
      })
    }
  }
  return aristas
}

/** Construye una `Relationship`; el dominio rechaza pares fuera de contrato. */
function crearRelacion(c: AristaCandidata): Relationship | undefined {
  try {
    return Relationship.create({ subject: c.subject, predicate: c.predicate, object: c.object, validFrom: '1970-01-01' })
  } catch (error) {
    // Best-effort explícito: la arista se descarta del pull, pero se registra
    // CUÁL cayó y por qué.
    const arista = `${c.subject.slug} -[${c.predicate}]-> ${c.object.type}:${c.object.slug}`
    console.warn(`[WARN] arista inválida descartada del pull F8B (${arista})`, { error })
    return undefined
  }
}
