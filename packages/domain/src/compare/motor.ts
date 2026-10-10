import type {
  ComparisonReport,
  ComparisonRow,
  ComparisonValueCell,
  CompareAttributeDef,
  CompareDeviceInput,
  CompareDeviceValue,
  CompareDevicesInput,
} from './compare-contratos.js'
import { compatibilidadesCuradas } from './compare-compatibilidad.js'
import { valorNumerico, valoresIguales } from './compare-normalizacion.js'
import { construirVeredicto } from './compare-veredicto.js'

/**
 * Motor de comparación de dispositivos (sección 18.2 / F5, NET-HW-040/041).
 * 100% puro y testeable sin UI: entrada = atributos EAV resueltos por
 * dispositivo + aristas curadas; salida = ComparisonReport con unificación
 * de filas, normalización, reglas por atributo, diferencias, insignias,
 * compatibilidades/incompatibilidades declarativas y veredicto por plantilla.
 *
 * Los contratos viven en `compare-contratos.ts`, la normalización en
 * `compare-normalizacion.ts`, el veredicto en `compare-veredicto.ts` y las
 * reglas de (in)compatibilidad (curadas y declarativas) en
 * `compare-compatibilidad.ts`; aquí solo se orquesta el reporte.
 */

export type {
  CompareValueType,
  CompareRule,
  CompareAttributeDef,
  CompareDeviceValue,
  CompareDeviceInput,
  ComparisonValueCell,
  ComparisonRow,
  CompatibilityNote,
  CompareDevicesInput,
  DeclarativeCompatInput,
  DeclarativeCompatResult,
  ComparisonReport,
} from './compare-contratos.js'
export { evaluateCompatibilidad } from './compare-compatibilidad.js'

type CeldaCruda = { readonly deviceSlug: string; readonly display: string; readonly valueNumber?: number | undefined }

/** Filas unificadas del reporte: defs por clave, específicas y filas ordenadas. */
interface FilasUnificadas {
  readonly defsPorKey: ReadonlyMap<string, CompareAttributeDef>
  readonly keysEspecificas: readonly string[]
  readonly rows: readonly ComparisonRow[]
}

export function compareDevices(input: CompareDevicesInput): ComparisonReport {
  const devices = [...input.devices]
  if (devices.length < 2) return reportInsuficiente(devices)

  const transversal = new Set(devices.map((d) => d.categoryCode)).size > 1
  const { defsPorKey, keysEspecificas, rows } = unificarFilas(devices)
  // §18.4: en comparación transversal solo se muestran filas comunes
  const rowsVisibles = transversal ? rows.filter((r) => r.common) : rows
  const especificas = keysEspecificas.map((key) => ({ key, labelEs: defsPorKey.get(key)!.labelEs }))
  return construirReporte(devices, transversal, rowsVisibles, especificas, input.curatedCompatible, keysEspecificas.length)
}

/** Reporte final: dispositivos, filas visibles, compatibilidades y veredicto. */
function construirReporte(
  devices: readonly CompareDeviceInput[],
  transversal: boolean,
  rows: readonly ComparisonRow[],
  especificas: readonly { key: string; labelEs: string }[],
  curatedCompatible: ReadonlyArray<readonly [string, string]>,
  atributosEspecificos: number,
): ComparisonReport {
  return {
    devices: devices.map((d) => ({ slug: d.slug, name: d.name, categoryCode: d.categoryCode, categoryName: d.categoryName })),
    transversal,
    rows,
    especificas,
    compatibilidades: compatibilidadesCuradas(devices, curatedCompatible),
    veredicto: construirVeredicto(rows, especificas, transversal),
    filasConDiferencias: rows.filter((r) => !r.allEqual).length,
    atributosEspecificos,
  }
}

/** Reporte vacío cuando faltan dispositivos: el veredicto explica el motivo. */
function reportInsuficiente(devices: readonly CompareDeviceInput[]): ComparisonReport {
  return {
    devices: devices.map((d) => ({ slug: d.slug, name: d.name, categoryCode: d.categoryCode, categoryName: d.categoryName })),
    transversal: false,
    rows: [],
    especificas: [],
    compatibilidades: [],
    veredicto: ['El comparador necesita al menos dos dispositivos.'],
    filasConDiferencias: 0,
    atributosEspecificos: 0,
  }
}

/** 1) Unificación de filas: unión de defs (la primera gana), comunes primero. */
function unificarFilas(devices: readonly CompareDeviceInput[]): FilasUnificadas {
  const defsPorKey = new Map<string, CompareAttributeDef>()
  for (const d of devices) {
    for (const v of d.attributes) {
      if (!defsPorKey.has(v.def.key)) defsPorKey.set(v.def.key, v.def)
    }
  }
  const esComun = (key: string): boolean => devices.every((d) => d.attributes.some((v) => v.def.key === key))
  const keysComunes = [...defsPorKey.keys()].filter(esComun)
  const keysEspecificas = [...defsPorKey.keys()].filter((k) => !esComun(k))
  const rows = [...keysComunes, ...keysEspecificas].map((key) =>
    construirFila(key, defsPorKey.get(key)!, devices, esComun),
  )
  return { defsPorKey, keysEspecificas, rows }
}

/** Fila completa: celdas, mejor valor según la regla y explicación de pérdida. */
function construirFila(
  key: string,
  def: CompareAttributeDef,
  devices: readonly CompareDeviceInput[],
  esComun: (key: string) => boolean,
): ComparisonRow {
  const celdas: CeldaCruda[] = devices.map((d) => {
    const v = d.attributes.find((x) => x.def.key === key)
    if (!v) return { deviceSlug: d.slug, display: '—' }
    return { deviceSlug: d.slug, display: v.display, valueNumber: valorNumerico(v) }
  })
  const presentes = devices
    .map((d) => d.attributes.find((x) => x.def.key === key))
    .filter((x): x is CompareDeviceValue => x !== undefined)
  const allEqual = valoresIguales(presentes)
  const mejores = calcularMejores(def, allEqual, celdas)
  return {
    key,
    labelEs: def.labelEs,
    unit: def.unit,
    valueType: def.valueType,
    compareRule: def.compareRule,
    common: esComun(key),
    values: construirCeldas(celdas, mejores, def.unit),
    allEqual,
  }
}

/** Dispositivos con el valor extremo (mayor/menor) según la regla del atributo. */
function calcularMejores(
  def: CompareAttributeDef,
  allEqual: boolean,
  celdas: readonly CeldaCruda[],
): Set<string> {
  const numericos = celdas
    .map((c) => ({ slug: c.deviceSlug, n: c.valueNumber }))
    .filter((c): c is { slug: string; n: number } => c.n !== undefined)
  if (allEqual || numericos.length === 0) return new Set()
  if (def.compareRule !== 'higher-better' && def.compareRule !== 'lower-better') return new Set()
  const extremo =
    def.compareRule === 'higher-better'
      ? Math.max(...numericos.map((c) => c.n))
      : Math.min(...numericos.map((c) => c.n))
  return new Set(numericos.filter((c) => c.n === extremo).map((c) => c.slug))
}

/** Celdas finales con insignia de mejor y razón de pérdida legible. */
function construirCeldas(
  celdas: readonly CeldaCruda[],
  mejores: ReadonlySet<string>,
  unit: string | undefined,
): readonly ComparisonValueCell[] {
  const mejorUnit = unit ? ` ${unit}` : ''
  const mejorDisplay = (slug: string): string => {
    const c = celdas.find((x) => x.deviceSlug === slug)
    return c ? `${c.display}${mejorUnit}` : '—'
  }
  return celdas.map((c) => {
    let lossReason: string | undefined
    const mejor = [...mejores][0]
    if (mejores.size > 0 && !mejores.has(c.deviceSlug) && c.valueNumber !== undefined && mejor !== undefined) {
      lossReason = `${c.deviceSlug}: ${c.display}${mejorUnit} frente a ${mejorDisplay(mejor)}`
    }
    return { ...c, isBest: mejores.has(c.deviceSlug), lossReason }
  })
}
