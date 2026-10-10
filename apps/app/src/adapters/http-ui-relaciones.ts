import { Relationship } from '@netatlas/domain'
import type { SnapshotBody } from './http-ui-tipos.js'
import { OBJECT_TYPES } from './http-ui-tipos.js'

/**
 * Aristas del snapshot → `Relationship` (dominio valida predicado y tipos).
 * Se descartan las filas que apuntan a entidades desconocidas o usan
 * predicados fuera de catálogo — nunca tumban el pull.
 */
export function construirRelaciones(body: SnapshotBody, known: ReadonlySet<string>): Relationship[] {
  // Aristas device↔device (snapshot) y aristas de catálogo del detalle; ambas
  // se normalizan a `Relationship` (simétrico device↔device validado en dominio).
  return [...aristasDeTopologia(body, known), ...aristasDeCatalogo(body, known)]
}

/** Aristas de topología del snapshot (nodos desconocidos → descartadas). */
function aristasDeTopologia(body: SnapshotBody, known: ReadonlySet<string>): Relationship[] {
  const rels: Relationship[] = []
  for (const l of body.links ?? []) {
    if (l.from === l.to || !known.has(l.from) || !known.has(l.to)) continue
    const rel = crearRelacion({ type: 'device', slug: l.from }, 'compatible-with', { type: 'device', slug: l.to })
    if (rel) rels.push(rel)
    else console.warn(`[WARN] arista de topología inválida en el pull F8B: ${l.from} → ${l.to}`)
  }
  return rels
}

/** Aristas de catálogo del detalle (tipo/predicado fuera de catálogo → fuera). */
function aristasDeCatalogo(body: SnapshotBody, known: ReadonlySet<string>): Relationship[] {
  const rels: Relationship[] = []
  for (const d of body.detalle?.devices ?? []) {
    if (!known.has(d.slug)) continue
    for (const r of d.relations) {
      const objectType = OBJECT_TYPES[r.objectType as keyof typeof OBJECT_TYPES]
      if (!objectType) continue
      const rel = crearRelacion({ type: 'device', slug: d.slug }, r.predicate, { type: objectType, slug: r.objectCode })
      if (rel) rels.push(rel)
      else console.warn(`[WARN] relación de catálogo inválida en el pull F8B: ${d.slug} (${r.predicate})`)
    }
  }
  return rels
}

/** Construye una `Relationship`; el dominio rechaza pares fuera de contrato. */
function crearRelacion(
  subject: Relationship['subject'],
  predicate: string,
  object: Relationship['object'],
): Relationship | undefined {
  try {
    return Relationship.create({ subject, predicate, object, validFrom: '1970-01-01' })
  } catch (error) {
    // Best-effort explícito: el detalle de la fila lo registra el llamador.
    console.warn('[WARN] relación inválida en el pull F8B', { error })
    return undefined
  }
}
