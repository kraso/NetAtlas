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
 *
 * Los insumos por dispositivo viven en `compare-devices-insumos.ts`.
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
import { insumosDeDispositivo } from './compare-devices-insumos.js'

export interface CompareInput {
  /** Slugs de los dispositivos a comparar (2–N). */
  readonly slugs: readonly string[]
}

/** Puertos que necesita el caso de uso (el grafo se usa solo por `edgesOf`). */
interface PuertosComparacion {
  devices: DevicePort
  attributes: AttributesPort
  /** Solo `edgesOf` (segregación de interfaces): el BFS de neighbors/paths no se usa. */
  graph: Pick<GraphRepository, 'edgesOf'>
}

/** Insumos de todos los dispositivos más los mapas por slug. */
interface ContextoComparacion {
  readonly inputs: CompareDeviceInput[]
  readonly puertosPorSlug: Map<string, number[]>
  readonly mediosPorSlug: Map<string, string[]>
  readonly poePorSlug: Map<string, { budget?: number; required?: number }>
}

/**
 * Resuelve los dispositivos a comparar, reuniendo atributos EAV, aristas curadas
 * y datos de puertos/medios/PoE para las reglas declarativas, y produce el
 * `ComparisonReport` final con compatibilidades/incompatibilidades adjuntas.
 */
export async function compareDevicesUseCase(
  ports: PuertosComparacion,
  input: CompareInput,
): Promise<ComparisonReport | null> {
  if (input.slugs.length < 2) return null

  const dispositivos = await resolverDispositivos(ports.devices, input.slugs)
  if (dispositivos.length < 2) return null

  const ctx = await construirInsumos(ports, dispositivos)
  if (ctx.inputs.length < 2) return null

  const { curadas, declarativos } = await evaluarPares(ports.graph, ctx)
  return adjuntarDeclarativos(compareDevices({ devices: ctx.inputs, curatedCompatible: curadas }), declarativos)
}

/** Resuelve los slugs existentes en el dataset (los ausentes se ignoran). */
async function resolverDispositivos(devices: DevicePort, slugs: readonly string[]): Promise<Device[]> {
  const dispositivos: Device[] = []
  for (const slug of slugs) {
    const d = await devices.findBySlug(slug)
    if (d) dispositivos.push(d)
  }
  return dispositivos
}

/** Reúne los insumos de cada dispositivo en un contexto indexado por slug. */
async function construirInsumos(ports: PuertosComparacion, dispositivos: readonly Device[]): Promise<ContextoComparacion> {
  const ctx: ContextoComparacion = {
    inputs: [],
    puertosPorSlug: new Map(),
    mediosPorSlug: new Map(),
    poePorSlug: new Map(),
  }
  for (const d of dispositivos) {
    const insumos = await insumosDeDispositivo(ports, d)
    ctx.inputs.push(insumos.input)
    ctx.puertosPorSlug.set(insumos.input.slug, insumos.puertos)
    ctx.mediosPorSlug.set(insumos.input.slug, insumos.medios)
    ctx.poePorSlug.set(insumos.input.slug, insumos.poe)
  }
  return ctx
}

/** Evalúa cada par: aristas curadas `compatible-with` + reglas declarativas. */
async function evaluarPares(
  graph: Pick<GraphRepository, 'edgesOf'>,
  ctx: ContextoComparacion,
): Promise<{ curadas: Array<readonly [string, string]>; declarativos: { a: string; b: string; note?: string }[] }> {
  const curadas: Array<readonly [string, string]> = []
  const declarativos: { a: string; b: string; note?: string }[] = []
  for (let i = 0; i < ctx.inputs.length; i++) {
    for (let j = i + 1; j < ctx.inputs.length; j++) {
      const x = ctx.inputs[i]!
      const y = ctx.inputs[j]!
      if (await esParCurado(graph, x.slug, y.slug)) curadas.push([x.slug, y.slug])
      const res = evaluateCompatibilidad({
        a: x.slug,
        b: y.slug,
        speedsA: ctx.puertosPorSlug.get(x.slug) ?? [],
        speedsB: ctx.puertosPorSlug.get(y.slug) ?? [],
        mediumsA: ctx.mediosPorSlug.get(x.slug) ?? [],
        mediumsB: ctx.mediosPorSlug.get(y.slug) ?? [],
        poeBudgetAW: ctx.poePorSlug.get(x.slug)?.budget,
        poeBudgetBW: ctx.poePorSlug.get(y.slug)?.budget,
        poeRequiredAW: ctx.poePorSlug.get(x.slug)?.required,
        poeRequiredBW: ctx.poePorSlug.get(y.slug)?.required,
      })
      if (!res.compatible) declarativos.push({ a: x.slug, b: y.slug, note: res.note })
    }
  }
  return { curadas, declarativos }
}

/** ¿Existe una arista curada `compatible-with` entre los dos dispositivos? */
async function esParCurado(graph: Pick<GraphRepository, 'edgesOf'>, a: string, b: string): Promise<boolean> {
  const aristas = await graph.edgesOf({ type: 'device', slug: a })
  return aristas.some((r) => r.predicate === 'compatible-with' && r.object.type === 'device' && r.object.slug === b)
}

/** Adjunta al informe las incompatibilidades declarativas detectadas. */
function adjuntarDeclarativos(
  informe: ComparisonReport,
  declarativos: readonly { a: string; b: string; note?: string }[],
): ComparisonReport {
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

// Re-exportados para tests
export type { DeviceQuery, Page }