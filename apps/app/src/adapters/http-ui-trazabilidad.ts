import { Assertion, Source } from '@netatlas/domain'
import type { Device, SyncDeviceDetail, SyncSource } from '@netatlas/domain'
import type { SnapshotBody } from './http-ui-tipos.js'
import { CONFIDENCES, SOURCE_KINDS } from './http-ui-tipos.js'

/**
 * Trazabilidad del snapshot (F8B): fuentes (una por slug, vocabulario
 * cerrado) y assertions por dispositivo — una fila inválida se descarta sin
 * tumbar el pull.
 */

/** Fuentes del detalle (filas inválidas descartadas; sus assertions, abajo). */
export function construirFuentes(body: SnapshotBody): Map<string, Source> {
  const fuentes = new Map<string, Source>()
  for (const s of body.detalle?.sources ?? []) {
    const fuente = fuenteDe(s)
    if (fuente) fuentes.set(s.slug, fuente)
  }
  return fuentes
}

/** Una fuente del detalle → Source (fuera de vocabulario cerrado → undefined). */
function fuenteDe(s: SyncSource): Source | undefined {
  try {
    if (!SOURCE_KINDS.has(s.kind)) return undefined
    if (s.authorityLevel !== 1 && s.authorityLevel !== 2 && s.authorityLevel !== 3 && s.authorityLevel !== 4) return undefined
    return Source.create({
      slug: s.slug,
      kind: s.kind as Source['kind'],
      publisher: s.publisher ?? undefined,
      title: s.title,
      url: s.url ?? undefined,
      retrievedOn: s.retrievedOn ?? undefined,
      authorityLevel: s.authorityLevel,
    })
  } catch (error) {
    // Best-effort explícito: fuente inválida → sus assertions se descartan abajo.
    console.warn(`[WARN] fuente inválida en el pull F8B: ${s.slug}`, { error })
    return undefined
  }
}

/**
 * Assertions del detalle → Assertion del dominio. subjectId in-memory =
 * índice del dispositivo + 1 (mismo convenio que
 * InMemorySourcingRepository.assertionsForDevice).
 */
export function construirAfirmaciones(
  dispositivos: readonly Device[],
  detPorSlug: ReadonlyMap<string, SyncDeviceDetail>,
  fuentes: ReadonlyMap<string, Source>,
): Assertion[] {
  const afirmaciones: Assertion[] = []
  dispositivos.forEach((dev, i) => {
    const det = detPorSlug.get(dev.slug.value)
    if (!det) return
    for (const a of det.assertions) {
      const afirmacion = afirmacionDe(a, i + 1, fuentes)
      if (afirmacion) afirmaciones.push(afirmacion)
    }
  })
  return afirmaciones
}

/** Una assertion del detalle → Assertion (fila inválida → undefined). */
function afirmacionDe(
  a: SyncDeviceDetail['assertions'][number],
  subjectId: number,
  fuentes: ReadonlyMap<string, Source>,
): Assertion | undefined {
  try {
    const fuente = fuentes.get(a.sourceSlug)
    if (!fuente || !CONFIDENCES.has(a.confidence)) return undefined
    return Assertion.create({
      subjectType: 'device',
      subjectId,
      predicate: a.predicate,
      valueJson: a.valueJson,
      source: fuente,
      confidence: a.confidence as Assertion['confidence'],
      verifiedOn: a.verifiedOn,
      author: a.author,
      reviewedBy: a.reviewedBy ?? undefined,
      note: a.note ?? undefined,
    })
  } catch (error) {
    // Best-effort explícito: afirmación inválida (fecha no ISO, etc.) → descartar fila.
    console.warn(`[WARN] afirmación inválida en el pull F8B (${a.predicate})`, { error })
    return undefined
  }
}
