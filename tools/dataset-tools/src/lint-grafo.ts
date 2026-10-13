import { findPredicate } from '@netatlas/domain'
import type { Push, SeedCatalogs, SeedDevice, SeedRelationship } from './lint-tipos.js'

/**
 * Reglas 8, 9 y 10 de data:lint (PLAN MAESTRO §8.6):
 * 8. Relaciones: predicado conocido y extremos referenciados (catálogo cerrado).
 * 9. `replaced-by` ⇒ estado EoL+ en el sujeto.
 * 10. `evolves-into`/`succeeds` acíclicos.
 */

/** Catálogos e índices que necesitan las reglas de grafo. */
export interface ContextoGrafo {
  readonly protocolCodes: ReadonlySet<string>
  readonly mediumCodes: ReadonlySet<string>
  readonly standardRefs: ReadonlySet<string>
  readonly deviceSlugs: ReadonlySet<string>
}

/** Índices del grafo: códigos de catálogo cerrado y slugs de dispositivo. */
export function contextoDeGrafo(input: SeedCatalogs): ContextoGrafo {
  return {
    protocolCodes: new Set(input.protocols.map((p) => p.code)),
    mediumCodes: new Set(input.media.map((m) => m.code)),
    standardRefs: new Set(input.standards.map((s) => `${s.org}/${s.identifier}`.toLowerCase())),
    deviceSlugs: new Set(input.devices.map((d) => d.slug)),
  }
}

/** 8.6-1: extremos de catálogo cerrado (protocolo/estándar/medio) deben existir. */
function validarExtremosDeCatalogo(
  device: SeedDevice,
  rel: SeedRelationship,
  ctx: ContextoGrafo,
  push: Push,
): void {
  if (rel.objectType === 'protocol' && !ctx.protocolCodes.has(rel.objectSlug)) {
    push('error', 'closed-catalog', `Dispositivo "${device.slug}": relación "${rel.predicate}" a protocolo inexistente "${rel.objectSlug}".`)
  }
  if (rel.objectType === 'medium' && !ctx.mediumCodes.has(rel.objectSlug)) {
    push('error', 'closed-catalog', `Dispositivo "${device.slug}": relación "${rel.predicate}" a medio inexistente "${rel.objectSlug}".`)
  }
  if (rel.objectType === 'standard' && !ctx.standardRefs.has(rel.objectSlug.toLowerCase())) {
    push('error', 'closed-catalog', `Dispositivo "${device.slug}": relación "${rel.predicate}" a estándar inexistente "${rel.objectSlug}".`)
  }
}

/** 8/9. Relaciones de un dispositivo: predicado, extremo y estado EoL. */
export function validarRelaciones(device: SeedDevice, ctx: ContextoGrafo, push: Push): void {
  for (const rel of device.relationships ?? []) {
    const spec = findPredicate(rel.predicate)
    if (!spec) {
      push('error', 'relationship-predicate', `Dispositivo "${device.slug}": predicado desconocido "${rel.predicate}".`)
    } else if (rel.objectType === 'device' && !ctx.deviceSlugs.has(rel.objectSlug)) {
      push('error', 'relationship-object', `Dispositivo "${device.slug}": relación "${rel.predicate}" apunta a dispositivo inexistente "${rel.objectSlug}".`)
    }

    validarExtremosDeCatalogo(device, rel, ctx, push)

    // 9. replaced-by ⇒ EoL+
    if (rel.predicate === 'replaced-by') {
      const eolLike = ['eol', 'eos', 'discontinued']
      if (!eolLike.includes(device.lifecycleStatus)) {
        push('error', 'replaced-by-lifecycle', `Dispositivo "${device.slug}" tiene "replaced-by" pero su estado es "${device.lifecycleStatus}" (debe ser eol/eos/discontinued).`)
      }
    }
  }
}

/** Aristas acíclicas (evolves-into, succeeds, replaced-by) como adyacencia. */
function construirAdyacencia(devices: readonly SeedDevice[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  for (const device of devices) {
    for (const rel of device.relationships ?? []) {
      const spec = findPredicate(rel.predicate)
      if (spec?.acyclic && rel.objectType === 'device') {
        const siguientes = adjacency.get(device.slug)
        if (siguientes === undefined) adjacency.set(device.slug, [rel.objectSlug])
        else siguientes.push(rel.objectSlug)
      }
    }
  }
  return adjacency
}

/** Estado del recorrido en profundidad que busca un ciclo. */
interface EstadoCiclo {
  readonly adjacency: ReadonlyMap<string, readonly string[]>
  readonly visiting: Set<string>
  readonly done: Set<string>
  readonly stack: string[]
}

/** Camino del ciclo que arranca en `node`, si lo hay. */
function buscarCicloDesde(node: string, estado: EstadoCiclo): string[] | undefined {
  if (estado.done.has(node)) return undefined
  if (estado.visiting.has(node)) {
    const idx = estado.stack.indexOf(node)
    return [...estado.stack.slice(idx), node]
  }
  estado.visiting.add(node)
  estado.stack.push(node)
  for (const next of estado.adjacency.get(node) ?? []) {
    const cycle = buscarCicloDesde(next, estado)
    if (cycle) return cycle
  }
  estado.stack.pop()
  estado.visiting.delete(node)
  estado.done.add(node)
  return undefined
}

/** Primer ciclo de genealogía, si lo hay. */
function buscarCiclo(adjacency: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  const estado: EstadoCiclo = { adjacency, visiting: new Set<string>(), done: new Set<string>(), stack: [] }
  for (const node of adjacency.keys()) {
    const cycle = buscarCicloDesde(node, estado)
    if (cycle) return cycle
  }
  return undefined
}

/** 10. Aciclicidad de genealogía (evolves-into, succeeds, replaced-by). */
export function validarGenealogia(devices: readonly SeedDevice[], push: Push): void {
  const cycle = buscarCiclo(construirAdyacencia(devices))
  if (cycle) {
    push('error', 'genealogy-acyclic', `Ciclo de genealogía detectado: ${cycle.join(' → ')}.`)
  }
}
