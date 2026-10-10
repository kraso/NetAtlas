import type { CompareDeviceInput, CompareDeviceValue, Device, GraphRepository } from '@netatlas/domain'
import type { AttributesPort } from '../index.js'

/**
 * Insumos por dispositivo del comparador (F5): arma la entrada del motor puro
 * a partir de los atributos EAV, los puertos, los medios que termina y el PoE
 * declarado. Una pieza por responsabilidad, sin tocar el grafo de pares.
 */

/** Insumos declarativos de un dispositivo (puertos, medios y PoE). */
export interface InsumosDispositivo {
  readonly input: CompareDeviceInput
  readonly puertos: number[]
  readonly medios: string[]
  readonly poe: { budget?: number; required?: number }
}

/** Insumos de un dispositivo: entrada del motor + puertos, medios y PoE. */
export async function insumosDeDispositivo(
  ports: { attributes: AttributesPort; graph: Pick<GraphRepository, 'edgesOf'> },
  d: Device,
): Promise<InsumosDispositivo> {
  const slug = d.slug.value
  const vals = await ports.attributes.attributeValuesForDevice(slug)
  const aristas = await ports.graph.edgesOf({ type: 'device', slug })
  const medios = aristas.filter((r) => r.predicate === 'terminates-medium').map((r) => r.object.slug)
  const puertosPoe = d.ports.reduce((acc, p) => acc + (p.poeStandard ? p.quantity : 0), 0)
  return {
    input: { slug, name: d.name, categoryCode: d.categoryCode, categoryName: d.categoryCode, attributes: atributosDe(d, vals, medios, puertosPoe) },
    puertos: d.ports.flatMap((p) => p.speedsMbps),
    medios,
    poe: poeDe(vals),
  }
}

/** Atributos del motor: los EAV del dispositivo más puertos, PoE y medios. */
function atributosDe(
  d: Device,
  vals: readonly { key: string; labelEs: string; valueType: string; unit?: string; display: string }[],
  medios: readonly string[],
  puertosPoe: number,
): CompareDeviceValue[] {
  return [
    ...vals.map((v) => ({
      def: { key: v.key, labelEs: v.labelEs, valueType: mapValueType(v.valueType), unit: v.unit, compareRule: 'higher-better' as const },
      display: v.display,
      valueNumber: parseNumero(v.display),
    })),
    { def: { key: 'puertos_totales', labelEs: 'Puertos totales', valueType: 'number' as const, compareRule: 'higher-better' as const }, display: String(d.portCount()), valueNumber: d.portCount() },
    { def: { key: 'puertos_poe', labelEs: 'Puertos con PoE', valueType: 'number' as const, compareRule: 'higher-better' as const }, display: String(puertosPoe), valueNumber: puertosPoe },
    ...(medios.length > 0
      ? [{ def: { key: 'medios', labelEs: 'Medios que termina', valueType: 'text' as const, compareRule: 'none' as const }, display: medios.join(', ') }]
      : []),
  ]
}

/** Presupuesto y consumo PoE declarados por el dispositivo. */
function poeDe(vals: readonly { key: string; display: string }[]): { budget?: number; required?: number } {
  const poeBudget = vals.find((v) => v.key === 'poe_budget_w')
  const poeRequired = vals.find((v) => v.key === 'poe_required_w')
  return {
    budget: poeBudget ? parseNumero(poeBudget.display) : undefined,
    required: poeRequired ? parseNumero(poeRequired.display) : undefined,
  }
}

/** Número de un display legible; `undefined` si el display no trae cifras. */
export function parseNumero(s: string): number | undefined {
  const limpio = String(s).replace(/[^\d.\-]/g, '')
  if (limpio === '' || limpio === '-' || limpio === '.') return undefined
  const n = Number(limpio)
  return Number.isFinite(n) ? n : undefined
}

/** Mapea valueType del contrato UI al tipo del dominio (el UIAttributeDefinition es un supertipo). */
export function mapValueType(vt: string): 'number' | 'text' | 'enum' | 'bool' | 'range' {
  switch (vt) {
    case 'number': return 'number'
    case 'enum': return 'enum'
    case 'bool': return 'bool'
    case 'range': return 'range'
    default: return 'text'
  }
}