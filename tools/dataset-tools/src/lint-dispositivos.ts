import { LIFECYCLE_STATUSES, isConfidence } from '@netatlas/domain'
import { contextoDeGrafo, validarRelaciones, type ContextoGrafo } from './lint-grafo.js'
import type { Push, SeedAssertion, SeedCatalogs, SeedDevice } from './lint-tipos.js'

/**
 * Reglas 2-7 y 11 de data:lint (PLAN MAESTRO §7.5, §8.6):
 * 2. Ningún dispositivo sin categoría primaria existente.
 * 3. Fabricantes referenciados existen.
 * 4. Slugs únicos entre dispositivos.
 * 5. Estados de ciclo de vida canónicos.
 * 6. Fuentes referenciadas por assertions existen.
 * 7. Confianza de assertions canónica.
 * 11. La fuente de una assertion es propia o compartida: ningún dispositivo cita
 *     el documento declarado por otro dispositivo (bug real: 42 assertions de 18
 *     dispositivos citaban el criterio editorial del hub 3Com para justificar
 *     protocolos que ese documento no cubre).
 *
 * Se recorre cada dispositivo una sola vez, en el orden histórico: escalares,
 * assertions y —en la misma pasada— relaciones (reglas 8-9, que viven en
 * `lint-grafo`), para no alterar el orden en que salen los avisos.
 */

/** Índices y estado mutable que comparten las comprobaciones por dispositivo. */
interface ContextoDispositivos {
  readonly manufacturerSlugs: ReadonlySet<string>
  readonly categoryCodes: ReadonlySet<string>
  readonly sourceSlugs: ReadonlySet<string>
  readonly protocolCodes: ReadonlySet<string>
  readonly duenosDeFuente: Map<string, Set<string>>
  /** Slugs ya recorridos: delata duplicados sin reescanear la lista. */
  readonly vistos: Set<string>
}

/**
 * Propietarios de cada fuente declarada como documento de un dispositivo.
 * Una fuente sin propietario es compartida (estándar, certificación, criterio
 * editorial general, datos asistidos) y cualquier dispositivo puede citarla.
 */
export function propietariosDeFuentes(devices: readonly SeedDevice[]): Map<string, Set<string>> {
  const duenosDeFuente = new Map<string, Set<string>>()
  for (const device of devices) {
    for (const ds of device.datasheets ?? []) {
      const duenos = duenosDeFuente.get(ds.sourceSlug) ?? new Set<string>()
      duenos.add(device.slug)
      duenosDeFuente.set(ds.sourceSlug, duenos)
    }
  }
  return duenosDeFuente
}

/** 2/3/4/5. Datos escalares del dispositivo. */
function validarDispositivo(device: SeedDevice, ctx: ContextoDispositivos, push: Push): void {
  if (ctx.vistos.has(device.slug)) {
    push('error', 'device-duplicate', `Slug de dispositivo duplicado: "${device.slug}".`)
  }
  ctx.vistos.add(device.slug)

  if (device.manufacturerSlug !== undefined && !ctx.manufacturerSlugs.has(device.manufacturerSlug)) {
    push('error', 'device-manufacturer', `Dispositivo "${device.slug}" referencia fabricante inexistente "${device.manufacturerSlug}".`)
  }
  if (!ctx.categoryCodes.has(device.categoryCode)) {
    push('error', 'device-category', `Dispositivo "${device.slug}" referencia categoría inexistente "${device.categoryCode}".`)
  }
  if (!LIFECYCLE_STATUSES.includes(device.lifecycleStatus as (typeof LIFECYCLE_STATUSES)[number])) {
    push('error', 'device-lifecycle', `Dispositivo "${device.slug}" tiene estado de ciclo de vida inválido "${device.lifecycleStatus}".`)
  }
}

/** 6/7/11 + 8.6-1. Una assertion: fuente, confianza, fuente ajena y catálogo. */
function validarAssertion(
  device: SeedDevice,
  assertion: SeedAssertion,
  ctx: ContextoDispositivos,
  push: Push,
): void {
  if (!ctx.sourceSlugs.has(assertion.sourceSlug)) {
    push('error', 'assertion-source', `Dispositivo "${device.slug}": assertion "${assertion.predicate}" referencia fuente inexistente "${assertion.sourceSlug}".`)
  }
  if (assertion.confidence !== undefined && !isConfidence(assertion.confidence)) {
    push('error', 'assertion-confidence', `Dispositivo "${device.slug}": confianza inválida "${assertion.confidence}".`)
  }
  // 11. Fuente ajena: el documento de otro dispositivo no sostiene este dato.
  const duenos = ctx.duenosDeFuente.get(assertion.sourceSlug)
  if (duenos !== undefined && !duenos.has(device.slug)) {
    push('error', 'assertion-source-ajena', `Dispositivo "${device.slug}": assertion "${assertion.predicate}" cita el documento de "${[...duenos].join('/')}" ("${assertion.sourceSlug}").`)
  }
  // 8.6-1: supports-protocol en assertion debe apuntar a catálogo cerrado
  if (assertion.predicate === 'supports-protocol' && typeof assertion.value === 'string') {
    const code = assertion.value.trim().toLowerCase()
    if (!ctx.protocolCodes.has(code)) {
      push('error', 'closed-catalog', `Dispositivo "${device.slug}": assertion supports-protocol apunta a protocolo inexistente "${assertion.value}".`)
    }
  }
}

/** 6/7/11. Todas las assertions de un dispositivo. */
function validarAssertions(device: SeedDevice, ctx: ContextoDispositivos, push: Push): void {
  for (const assertion of device.assertions ?? []) {
    validarAssertion(device, assertion, ctx, push)
  }
}

/** Reglas 2-11 sobre todo el seed, en una sola pasada por dispositivo. */
export function validarDispositivos(input: SeedCatalogs, push: Push): void {
  const grafo: ContextoGrafo = contextoDeGrafo(input)
  const ctx: ContextoDispositivos = {
    manufacturerSlugs: new Set(input.manufacturers.map((m) => m.slug)),
    categoryCodes: new Set(input.categories.map((c) => c.code)),
    sourceSlugs: new Set(input.sources.map((s) => s.slug)),
    protocolCodes: grafo.protocolCodes,
    duenosDeFuente: propietariosDeFuentes(input.devices),
    vistos: new Set<string>(),
  }
  for (const device of input.devices) {
    validarDispositivo(device, ctx, push)
    validarAssertions(device, ctx, push)
    // Reglas 8-9 en la misma pasada: el orden de los avisos no cambia.
    validarRelaciones(device, grafo, push)
  }
}
