import type {
  CompareDeviceInput,
  CompatibilityNote,
  DeclarativeCompatInput,
  DeclarativeCompatResult,
} from './compare-contratos.js'

/**
 * Reglas de (in)compatibilidad del catálogo (§18.2-4): las aristas curadas
 * compatible-with y las reglas declarativas:
 *  - sin interfaz común (velocidades disjuntas) → conflictivo
 *  - óptica monomodo (SMF) contra multimodo (MMF) → conflicto de medio
 *  - PoE requerido por un extremo > presupuesto del otro → conflicto de alimentación
 * Se basa únicamente en datos reales del inventario; nunca inventa.
 */

/** Medios ópticos monomodo / multimodo (códigos del catálogo cerrado). */
const esMonomodo = (m: string): boolean => m === 'smf-os2' || m === 'smf-os1'
const esMultimodo = (m: string): boolean => m === 'mmf-om3' || m === 'mmf-om4' || m === 'mmf-om5'

/**
 * Evalúa las tres reglas declarativas en orden (interfaz, medio, PoE) y
 * devuelve la primera incompatibilidad encontrada, o compatible si no hay.
 */
export function evaluateCompatibilidad(input: DeclarativeCompatInput): DeclarativeCompatResult {
  return evaluarInterfazComun(input) ?? evaluarMedioOptico(input) ?? evaluarPoe(input)
}

/** Sin ninguna velocidad compartida (y ambos con interfaces) no se interconectan. */
function evaluarInterfazComun(input: DeclarativeCompatInput): DeclarativeCompatResult | undefined {
  const comunes = input.speedsA.filter((s) => input.speedsB.includes(s))
  if (comunes.length > 0 || input.speedsA.length === 0 || input.speedsB.length === 0) return undefined
  return {
    compatible: false,
    note: `Sin interfaz común: ${input.a} (${input.speedsA.join('/')} Mbps) vs ${input.b} (${input.speedsB.join('/')} Mbps).`,
  }
}

/** Monomodo (SMF) contra multimodo (MMF) no terminan en el mismo enlace. */
function evaluarMedioOptico(input: DeclarativeCompatInput): DeclarativeCompatResult | undefined {
  const smfA = input.mediumsA.some(esMonomodo)
  const mmfA = input.mediumsA.some(esMultimodo)
  const smfB = input.mediumsB.some(esMonomodo)
  const mmfB = input.mediumsB.some(esMultimodo)
  if ((smfA && mmfB) || (mmfA && smfB)) {
    return { compatible: false, note: `Medio óptico incompatible: monomodo (SMF) contra multimodo (MMF).` }
  }
  return undefined
}

/** El PoE requerido por un extremo no puede superar el presupuesto del otro. */
function evaluarPoe(input: DeclarativeCompatInput): DeclarativeCompatResult {
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

// ── Aristas curadas (compatible-with) ───────────────────────────────────────

/** Pares marcados como compatibles por arista curada (compatible-with). */
export function compatibilidadesCuradas(
  devices: readonly CompareDeviceInput[],
  curatedCompatible: ReadonlyArray<readonly [string, string]>,
): readonly CompatibilityNote[] {
  const curado = new Set(curatedCompatible.map(([a, b]) => [a, b].sort().join('|')))
  return paresDeDispositivos(devices).flatMap(([a, b]) => compatibilidadCurada(a, b, curado))
}

/** Un par solo es compatible si la arista curada lo declara (nunca inferido). */
function compatibilidadCurada(
  a: CompareDeviceInput,
  b: CompareDeviceInput,
  curado: ReadonlySet<string>,
): readonly CompatibilityNote[] {
  if (!curado.has([a.slug, b.slug].sort().join('|'))) return []
  // Las reglas declarativas de puertos se evalúan en la UI (necesita el
  // inventario real); el motor expone solo la evidencia curada.
  return [{ a: a.slug, b: b.slug, compatible: true, note: 'Compatibles según arista curada compatible-with.' }]
}

/** Todos los pares sin repetición (i < j) de la lista de dispositivos. */
function paresDeDispositivos(devices: readonly CompareDeviceInput[]): ReadonlyArray<readonly [CompareDeviceInput, CompareDeviceInput]> {
  const pares: Array<readonly [CompareDeviceInput, CompareDeviceInput]> = []
  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      pares.push([devices[i]!, devices[j]!])
    }
  }
  return pares
}
