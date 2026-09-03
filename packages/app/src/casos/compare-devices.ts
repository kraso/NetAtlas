/**
 * Caso de uso: Comparador de dispositivos (§18 / F5, NET-HW-039/040/041).
 *
 * Orquesta los puertos `DevicePort`, `AttributesPort`, `GraphRepository`
 * para construir la entrada del motor puro `compareDevices` del dominio, y
 * luego aplica las incompatibilidades declarativas (NET-HW-041).
 *
 * Extraído de apps/app/src/ui/comparar.tsx (líneas 55-149) para que:
 *  - la UI solo proyecta el `ComparisonReport` recibido;
 *  - el servidor (F8B) puede producir comparativas vía API sin duplicar.
 */
import { compareDevices, evaluateCompatibilidad } from '@netatlas/domain'
import type {
  CompareDeviceInput,
  ComparisonReport,
  Device,
  DeviceQuery,
  GraphRepository,
  Page,
} from '@netatlas/domain'
import type {
  DevicePort,
  AttributesPort,
} from '../index.js'

export interface CompareInput {
  /** Slugs de los dispositivos a comparar (2–N). */
  readonly slugs: readonly string[]
}

/**
 * Resuelve los dispositivos a comparar, reuniendo atributos EAV, aristas curadas
 * y datos de puertos/medios/PoE para las reglas declarativas, y produce el
 * `ComparisonReport` final con compatibilidades/incompatibilidades adjuntas.
 */
export async function compareDevicesUseCase(
  ports: {
    devices: DevicePort
    attributes: AttributesPort
    graph: GraphRepository
  },
  input: CompareInput,
): Promise<ComparisonReport | null> {
  if (input.slugs.length < 2) return null

  const dispositivos: Device[] = []
  for (const slug of input.slugs) {
    const d = await ports.devices.findBySlug(slug)
    if (d) dispositivos.push(d)
  }
  if (dispositivos.length < 2) return null

  const puertosPorSlug = new Map<string, number[]>()
  const mediosPorSlug = new Map<string, string[]>()
  const poePorSlug = new Map<string, { budget?: number; required?: number }>()

  const inputs: CompareDeviceInput[] = []

  const parseNumero = (s: string): number | undefined => {
    const n = Number(String(s).replace(/[^\d.\-]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }

  for (const d of dispositivos) {
    const slug = d.slug.value
    const vals = await ports.attributes.attributeValuesForDevice(slug)
    const aristas = await ports.graph.edgesOf({ type: 'device', slug })
    const medios = aristas.filter((r) => r.predicate === 'terminates-medium').map((r) => r.object.slug)

    const poeBudget = vals.find((v) => v.key === 'poe_budget_w')
    const poeRequired = vals.find((v) => v.key === 'poe_required_w')
    const puertosPoe = d.ports.reduce((acc, p) => acc + (p.poeStandard ? p.quantity : 0), 0)

    inputs.push({
      slug,
      name: d.name,
      categoryCode: d.categoryCode,
      categoryName: d.categoryCode, // la UI resuelve el nombre legible; el reporte lo muestra
      attributes: [
        ...vals.map((v) => ({
          def: { key: v.key, labelEs: v.labelEs, valueType: mapValueType(v.valueType) as any, unit: v.unit, compareRule: 'higher-better' as const },
          display: v.display,
          valueNumber: parseNumero(v.display),
        })),
        {
          def: { key: 'puertos_totales', labelEs: 'Puertos totales', valueType: 'number' as const, compareRule: 'higher-better' as const },
          display: String(d.portCount()),
          valueNumber: d.portCount(),
        },
        {
          def: { key: 'puertos_poe', labelEs: 'Puertos con PoE', valueType: 'number' as const, compareRule: 'higher-better' as const },
          display: String(puertosPoe),
          valueNumber: puertosPoe,
        },
        ...(medios.length > 0
          ? [{ def: { key: 'medios', labelEs: 'Medios que termina', valueType: 'text' as const, compareRule: 'none' as const }, display: medios.join(', ') }]
          : []),
      ],
    })

    puertosPorSlug.set(slug, d.ports.flatMap((p) => p.speedsMbps))
    mediosPorSlug.set(slug, medios)
    poePorSlug.set(slug, {
      budget: poeBudget ? parseNumero(poeBudget.display) : undefined,
      required: poeRequired ? parseNumero(poeRequired.display) : undefined,
    })
  }

  if (inputs.length < 2) return null

  // Aristas compatible-with curadas + incompatibilidades declarativas por par
  const curadas: Array<readonly [string, string]> = []
  const declarativos: { a: string; b: string; note?: string }[] = []

  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) {
      const x = inputs[i]!
      const y = inputs[j]!
      const aristasX = await ports.graph.edgesOf({ type: 'device', slug: x.slug })
      if (aristasX.some((r) => r.predicate === 'compatible-with' && r.object.type === 'device' && r.object.slug === y.slug)) {
        curadas.push([x.slug, y.slug])
      }
      const res = evaluateCompatibilidad({
        a: x.slug,
        b: y.slug,
        speedsA: puertosPorSlug.get(x.slug) ?? [],
        speedsB: puertosPorSlug.get(y.slug) ?? [],
        mediumsA: mediosPorSlug.get(x.slug) ?? [],
        mediumsB: mediosPorSlug.get(y.slug) ?? [],
        poeBudgetAW: poePorSlug.get(x.slug)?.budget,
        poeBudgetBW: poePorSlug.get(y.slug)?.budget,
        poeRequiredAW: poePorSlug.get(x.slug)?.required,
        poeRequiredBW: poePorSlug.get(y.slug)?.required,
      } as any)
      if (!res.compatible) declarativos.push({ a: x.slug, b: y.slug, note: res.note })
    }
  }

  const informe = compareDevices({ devices: inputs, curatedCompatible: curadas })

  return {
    ...informe,
    compatibilidades: [
      ...informe.compatibilidades,
      ...declarativos.map((d) => ({ a: d.a, b: d.b, compatible: false, note: d.note })),
    ],
    veredicto: [
      ...declarativos.map((d) => `Incompatibilidad declarada: ${d.note ?? 'sin detalle'}`),
      ...informe.veredicto,
    ],
  }
}

/** Mapea valueType del contrato UI al tipo del dominio (el UIAttributeDefinition es un supertipo). */
function mapValueType(vt: string): 'number' | 'text' | 'enum' | 'bool' | 'range' {
  switch (vt) {
    case 'number': return 'number'
    case 'enum': return 'enum'
    case 'bool': return 'bool'
    case 'range': return 'range'
    default: return 'text'
  }
}

// Re-exportados para tests
export type { DeviceQuery, Page }
