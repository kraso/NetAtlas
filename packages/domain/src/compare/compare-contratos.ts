/**
 * Contratos del motor de comparación (§18.2 / F5, NET-HW-040/041): solo
 * tipos, para que el motor (`motor.ts`) y las reglas declarativas
 * (`compare-compatibilidad.ts`) sean módulos cortos.
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
