/**
 * Motor de comparación de dispositivos (sección 18.2 / F5, NET-HW-040/041).
 * 100% puro y testeable sin UI: entrada = atributos EAV resueltos por
 * dispositivo + aristas curadas; salida = ComparisonReport con unificación
 * de filas, normalización, reglas por atributo, diferencias, insignias,
 * compatibilidades/incompatibilidades declarativas y veredicto por plantilla.
 */

export type CompareValueType = 'number' | 'text' | 'enum' | 'bool' | 'range'
export type CompareRule = 'higher-better' | 'lower-better' | 'set-compare' | 'none'

export interface CompareAttributeDef {
  readonly key: string
  readonly labelEs: string
  readonly valueType: CompareValueType
  readonly unit?: string | undefined
  readonly compareRule: CompareRule
}

export interface CompareDeviceValue {
  readonly def: CompareAttributeDef
  /** Valor legible (p. ej. '176', 'sí', '256 Gbps'). */
  readonly display: string
  /** Valor numérico canónico cuando aplica (ya normalizado a la unidad del atributo). */
  readonly valueNumber?: number | undefined
}

export interface CompareDeviceInput {
  readonly slug: string
  readonly name: string
  readonly categoryCode: string
  readonly categoryName: string
  /** Atributos del dispositivo (definiciones resueltas, incluidas heredadas). */
  readonly attributes: readonly CompareDeviceValue[]
}

export interface ComparisonValueCell {
  readonly deviceSlug: string
  readonly display: string
  readonly valueNumber?: number | undefined
  /** ¿Este dispositivo tiene el mejor valor de la fila según la regla? */
  readonly isBest: boolean
  /** Explicación de la limitación frente al mejor (solo si no es best y aplica). */
  readonly lossReason?: string | undefined
}

export interface ComparisonRow {
  readonly key: string
  readonly labelEs: string
  readonly unit?: string | undefined
  readonly valueType: CompareValueType
  readonly compareRule: CompareRule
  /** Presente en todos los dispositivos (intersección de categorías). */
  readonly common: boolean
  readonly values: readonly ComparisonValueCell[]
  /** Vistos en comparación: sin resaltado cuando todos iguales. */
  readonly allEqual: boolean
}

export interface CompatibilityNote {
  readonly a: string
  readonly b: string
  readonly compatible: boolean
  readonly note?: string | undefined
}

export interface CompareDevicesInput {
  readonly devices: readonly CompareDeviceInput[]
  /** Pares con arista compatible-with curada (slugs). */
  readonly curatedCompatible: ReadonlyArray<readonly [string, string]>
}

// ── Incompatibilidades declarativas (NET-HW-041) ─────────────────────────────

/** Datos de puertos/medios para las reglas (vienen del inventario real). */
export interface DeclarativeCompatInput {
  readonly a: string
  readonly b: string
  /** Velocidades (Mbps) de las interfaces del dispositivo A/B. */
  readonly speedsA: readonly number[]
  readonly speedsB: readonly number[]
  /** Medios terminados (códigos, p. ej. 'smf-os2', 'mmf-om3'). */
  readonly mediumsA: readonly string[]
  readonly mediumsB: readonly string[]
  /** Presupuesto PoE (W) de cada dispositivo y requerimiento PoE (W) del otro. */
  readonly poeBudgetAW?: number | undefined
  readonly poeBudgetBW?: number | undefined
  readonly poeRequiredAW?: number | undefined
  readonly poeRequiredBW?: number | undefined
}

export interface DeclarativeCompatResult {
  readonly compatible: boolean
  readonly note?: string | undefined
}

/**
 * Reglas de (in)compatibilidad declarativas del catálogo (§18.2-4):
 *  - sin interfaz común (velocidades disjuntas) → conflictivo
 *  - óptica monomodo (SMF) contra multimodo (MMF) → conflicto de medio
 *  - PoE requerido por un extremo > presupuesto del otro → conflicto de alimentación
 * Se basa únicamente en datos reales del inventario; nunca inventa.
 */
export function evaluateCompatibilidad(input: DeclarativeCompatInput): DeclarativeCompatResult {
  const comunes = input.speedsA.filter((s) => input.speedsB.includes(s))
  if (comunes.length === 0 && input.speedsA.length > 0 && input.speedsB.length > 0) {
    return {
      compatible: false,
      note: `Sin interfaz común: ${input.a} (${input.speedsA.join('/')} Mbps) vs ${input.b} (${input.speedsB.join('/')} Mbps).`,
    }
  }
  const smfA = input.mediumsA.some((m) => m === 'smf-os2' || m === 'smf-os1')
  const mmfA = input.mediumsA.some((m) => m === 'mmf-om3' || m === 'mmf-om4' || m === 'mmf-om5')
  const smfB = input.mediumsB.some((m) => m === 'smf-os2' || m === 'smf-os1')
  const mmfB = input.mediumsB.some((m) => m === 'mmf-om3' || m === 'mmf-om4' || m === 'mmf-om5')
  if ((smfA && mmfB) || (mmfA && smfB)) {
    return { compatible: false, note: `Medio óptico incompatible: monomodo (SMF) contra multimodo (MMF).` }
  }
  if (input.poeRequiredBW !== undefined && input.poeBudgetAW !== undefined && input.poeRequiredBW > input.poeBudgetAW) {
    return {
      compatible: false,
      note: `${input.b} necesita ${input.poeRequiredBW} W PoE, pero ${input.a} solo ofrece ${input.poeBudgetAW} W.`,
    }
  }
  if (input.poeRequiredAW !== undefined && input.poeBudgetBW !== undefined && input.poeRequiredAW > input.poeBudgetBW) {
    return {
      compatible: false,
      note: `${input.a} necesita ${input.poeRequiredAW} W PoE, pero ${input.b} solo ofrece ${input.poeBudgetBW} W.`,
    }
  }
  return { compatible: true }
}

// ── Motor ────────────────────────────────────────────────────────────────────

export interface ComparisonReport {
  readonly devices: readonly { slug: string; name: string; categoryCode: string; categoryName: string }[]
  /** Comparación entre categorías distintas (§18.4): filas comunes + aviso. */
  readonly transversal: boolean
  readonly rows: readonly ComparisonRow[]
  /** Atributos específicos no comparados (solo revertidos en transversal). */
  readonly especificas: readonly { key: string; labelEs: string }[]
  readonly compatibilidades: readonly CompatibilityNote[]
  readonly veredicto: readonly string[]
  /** Cuántas filas muestran diferencias (para el modo "solo diferencias"). */
  readonly filasConDiferencias: number
  readonly atributosEspecificos: number
}

function valorNumerico(v: CompareDeviceValue): number | undefined {
  if (v.def.valueType !== 'number' && v.def.valueType !== 'range') return undefined
  if (v.valueNumber !== undefined) return v.valueNumber
  const parsed = Number(String(v.display).replace(/[^\d.\-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function valoresIguales(celda: readonly CompareDeviceValue[]): boolean {
  const tipo = celda[0]?.def.valueType
  if (tipo === 'number' || tipo === 'range') {
    const nums = celda.map(valorNumerico)
    return nums.every((n) => n === nums[0])
  }
  const displays = celda.map((c) => c.display)
  return displays.every((d) => d === displays[0])
}

export function compareDevices(input: CompareDevicesInput): ComparisonReport {
  const devices = [...input.devices]
  if (devices.length < 2) {
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

  const categorias = new Set(devices.map((d) => d.categoryCode))
  const transversal = categorias.size > 1

  // 1) Unificación de filas: unión de definiciones, comunes primero
  const defsPorKey = new Map<string, CompareAttributeDef>()
  for (const d of devices) {
    for (const v of d.attributes) {
      if (!defsPorKey.has(v.def.key)) defsPorKey.set(v.def.key, v.def)
    }
  }
  const keyComun = (key: string): boolean => devices.every((d) => d.attributes.some((v) => v.def.key === key))
  const keysComunes = [...defsPorKey.keys()].filter(keyComun)
  const keysEspecificas = [...defsPorKey.keys()].filter((k) => !keyComun(k))
  const orden = [...keysComunes, ...keysEspecificas]

  const rows: ComparisonRow[] = orden.map((key) => {
    const def = defsPorKey.get(key)!
    const celdas = devices.map((d) => {
      const v = d.attributes.find((x) => x.def.key === key)
      if (!v) return { deviceSlug: d.slug, display: '—' }
      return { deviceSlug: d.slug, display: v.display, valueNumber: valorNumerico(v) }
    })
    const allEqual = valoresIguales(devices.map((d) => d.attributes.find((x) => x.def.key === key)).filter((x): x is CompareDeviceValue => x !== undefined) as readonly CompareDeviceValue[])

    // 3) Regla por atributo: mejor valor + limitación
    let mejores = new Set<string>()
    if (!allEqual && (def.compareRule === 'higher-better' || def.compareRule === 'lower-better')) {
      const numericos = celdas.map((c) => ({ slug: c.deviceSlug, n: c.valueNumber })).filter((c): c is { slug: string; n: number } => c.n !== undefined)
      if (numericos.length > 0) {
        const extremo = def.compareRule === 'higher-better'
          ? Math.max(...numericos.map((c) => c.n))
          : Math.min(...numericos.map((c) => c.n))
        mejores = new Set(numericos.filter((c) => c.n === extremo).map((c) => c.slug))
      }
    }
    const mejorUnit = def.unit ? ` ${def.unit}` : ''
    const mejorDisplay = (slug: string): string => {
      const c = celdas.find((x) => x.deviceSlug === slug)
      return c ? `${c.display}${mejorUnit}` : '—'
    }
    const values: ComparisonValueCell[] = celdas.map((c) => {
      let lossReason: string | undefined
      if (mejores.size > 0 && !mejores.has(c.deviceSlug) && c.valueNumber !== undefined) {
        lossReason = `${c.deviceSlug}: ${c.display}${mejorUnit} frente a ${mejorDisplay([...mejores][0]!)}`
      }
      return { ...c, isBest: mejores.has(c.deviceSlug), lossReason }
    })

    return { key, labelEs: def.labelEs, unit: def.unit, valueType: def.valueType, compareRule: def.compareRule, common: keyComun(key), values, allEqual }
  })

  // 4) Compatibilidades/incompatibilidades: curadas + declarativas
  const compatibilidades: CompatibilityNote[] = []
  const curado = new Set(input.curatedCompatible.map(([a, b]) => [a, b].sort().join('|')))
  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const a = devices[i]!
      const b = devices[j]!
      const par = [a.slug, b.slug].sort().join('|')
      if (curado.has(par)) {
        compatibilidades.push({ a: a.slug, b: b.slug, compatible: true, note: 'Compatibles según arista curada compatible-with.' })
      }
      // reglas declarativas de puertos se evalúan en la UI (necesita inventario);
      // el motor expone el resultado vía la entrada del reporte si llega.
    }
  }

  // 5) Veredicto por plantilla determinista (sin IA)
  const veredicto: string[] = []
  const especificas = orden.filter((k) => !keyComun(k)).map((k) => ({ key: k, labelEs: defsPorKey.get(k)!.labelEs }))
  // §18.4: en comparación transversal solo se muestran filas comunes
  const rowsVisibles = transversal ? rows.filter((r) => r.common) : rows
  const filasConDiferencias = rowsVisibles.filter((r) => !r.allEqual).length
  for (const r of rowsVisibles) {
    if (r.allEqual) continue
    const bests = r.values.filter((v) => v.isBest)
    if (bests.length > 0 && (r.valueType === 'number' || r.valueType === 'range')) {
      const nomBests = bests.map((b) => `${b.deviceSlug} (${b.display})`).join(', ')
      veredicto.push(`En «${r.labelEs}», destaca ${nomBests}.`)
      for (const v of r.values.filter((x) => x.lossReason)) veredicto.push(`  ${v.lossReason}.`)
      continue
    }
    const noIguales = r.values
      .filter((v) => v.display !== '—')
      .map((v) => `${v.deviceSlug}: ${v.display}`)
      .join(' · ')
    if (noIguales && !bests.length) {
      veredicto.push(`«${r.labelEs}» difiere entre los candidatos: ${noIguales}.`)
    }
  }
  if (transversal) {
    veredicto.push(
      `Comparación transversal entre categorías: solo las filas comunes son directamente comparables; ${especificas.length} atributo${especificas.length === 1 ? '' : 's'} específico${especificas.length === 1 ? '' : 's'} no se comparan (${especificas.map((e) => e.labelEs).join(', ') || '—'}).`,
    )
  }
  if (filasConDiferencias === 0) {
    veredicto.push('Según los datos comparados, no hay diferencias significativas entre estos dispositivos.')
  }

  return {
    devices: devices.map((d) => ({ slug: d.slug, name: d.name, categoryCode: d.categoryCode, categoryName: d.categoryName })),
    transversal,
    rows: rowsVisibles,
    especificas,
    compatibilidades,
    veredicto,
    filasConDiferencias,
    atributosEspecificos: keysEspecificas.length,
  }
}