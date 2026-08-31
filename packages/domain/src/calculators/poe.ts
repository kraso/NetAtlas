/**
 * Calculadora de Power over Ethernet (NET-HW-028) — servicio puro del dominio.
 *
 * Clases IEEE 802.3 (af/at/bt) con presupuesto máximo por puerto y
 * presupuesto total por PSE. Unidades: vatios.
 * Fuente normativa: PLAN MAESTRO §28.1.5 / CU (casos de diseño de portales).
 */

export interface PoeClassInfo {
  readonly standard: string
  readonly maxWPerPort: number
  readonly label: string
}

/** Clasificación PoE canónica (máximo de potencia por puerto del PSE). */
export const POE_CLASSES: readonly PoeClassInfo[] = [
  { standard: '802.3af', maxWPerPort: 15.4, label: 'PoE' },
  { standard: '802.3at', maxWPerPort: 30, label: 'PoE+' },
  { standard: '802.3bt', maxWPerPort: 60, label: 'PoE++ (Tipo 3)' },
]

export interface PoeBudgetInput {
  readonly poeStandard: '802.3af' | '802.3at' | '802.3bt'
  readonly portCount: number
  /** Presupuesto total del PSE (p. ej. 370 W switch). */
  readonly pseBudgetW: number
  /** Potencia contratada por el puerto (0 = se asume la clase completa). */
  readonly perPortDrawW?: number
}

export interface PoeBudgetResult {
  readonly classPerPortW: number
  readonly totalRequiredW: number
  readonly withinBudget: boolean
  /** Puertos con PoE+ (802.3at) si el PSE lo soporta. */
  readonly poePlusPorts: number
  readonly note: string
}

export function poeClassMaxW(standard: string): number | undefined {
  return POE_CLASSES.find((c) => c.standard === standard)?.maxWPerPort
}

/** Presupuesto PoE: ¿puede el PSE alimentar N puertos a la clase solicitada? */
export function calculePoeBudget(input: PoeBudgetInput): PoeBudgetResult {
  const cls = POE_CLASSES.find((c) => c.standard === input.poeStandard)
  if (!cls) {
    throw new Error(`Estándar PoE desconocido: "${input.poeStandard}".`)
  }
  const perPort = input.perPortDrawW !== undefined ? input.perPortDrawW : cls.maxWPerPort
  const totalRequired = perPort * input.portCount
  const note =
    totalRequired <= input.pseBudgetW
      ? `Dentro de presupuesto: ${totalRequired.toFixed(1)} W ≤ ${input.pseBudgetW} W.`
      : `Presupuesto excedido: se necesitan ${totalRequired.toFixed(1)} W, el PSE entrega ${input.pseBudgetW} W.`
  return {
    classPerPortW: cls.maxWPerPort,
    totalRequiredW: Number(totalRequired.toFixed(1)),
    withinBudget: totalRequired <= input.pseBudgetW,
    poePlusPorts: input.poeStandard === '802.3at' || input.poeStandard === '802.3bt' ? input.portCount : 0,
    note,
  }
}

/** ¿Cuántos puertos de la clase pueden alimentarse con el presupuesto del PSE? */
export function maxPoePorts(supportedStandard: string, pseBudgetW: number): number {
  const maxW = poeClassMaxW(supportedStandard)
  if (maxW === undefined) return 0
  return Math.floor(pseBudgetW / maxW)
}