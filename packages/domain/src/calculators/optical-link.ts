/**
 * Calculadora de enlace óptico (NET-HW-028) — presupuesto de potencia (dB).
 *
 * Caso del plan (CU-09/CU-14): "interfaces de red… 10 km, SMF → LR 1310 nm;
 * margen de presupuesto óptico calculado".
 *
 * Modelo de pérdidas (dB):
 *   Presupuesto total = Tx (dBm) − Rx sensibilidad (dBm)
 *   Pérdida del enlace = α_fibra (dB/km)·L + conectores + empalmes + penalizaciones
 *   Margen = Presupuesto − Pérdida  (must ≥ 0 para viabilidad)
 */
export interface FibraSpec {
  readonly code: string
  /** Atenuación típica en dB/km a la longitud de onda de uso. */
  readonly atenuacionDbPorKm: number
}

export const FIBRAS: readonly FibraSpec[] = [
  { code: 'mmf-om3', atenuacionDbPorKm: 2.5 },
  { code: 'mmf-om4', atenuacionDbPorKm: 2.5 },
  { code: 'smf-os2', atenuacionDbPorKm: 0.4 },
  { code: 'smf-g657', atenuacionDbPorKm: 0.4 },
]

export interface TransceiverSpec {
  readonly code: string
  readonly wavelengthNm: number
  readonly txPowerDb: number
  readonly rxSensitivityDb: number
  /** Medio de fibra previsto (om3/os2…). */
  readonly mediumCode: string
}

export interface EnlaceOpticoInput {
  readonly distanciaKm: number
  readonly fibra: FibraSpec
  readonly transceiver: TransceiverSpec
  readonly conectores?: number
  readonly empalmes?: number
  readonly perdidaConectorDb?: number
  readonly perdidaEmpalmeDb?: number
  readonly penalizacionDispersionDb?: number
}

export interface EnlaceOpticoResult {
  readonly presupuestoTotalDb: number
  readonly perdidaEnlaceDb: number
  readonly margenDb: number
  readonly viable: boolean
  readonly note: string
}

const CONECTOR_DEFAULT_DB = 0.3
const EMPALME_DEFAULT_DB = 0.1

/** Calcula el margen de un enlace óptico punto a punto. */
export function calculeEnlaceOptico(input: EnlaceOpticoInput): EnlaceOpticoResult {
  const { distanciaKm, fibra, transceiver } = input
  if (distanciaKm < 0) throw new Error('distanciaKm no puede ser negativa.')

  const presupuestoTotalDb = transceiver.txPowerDb - transceiver.rxSensitivityDb
  const perdidaFibra = fibra.atenuacionDbPorKm * distanciaKm
  const conectores = input.conectores ?? 0
  const empalmes = input.empalmes ?? 0
  const perdidaConector = conectores * (input.perdidaConectorDb ?? CONECTOR_DEFAULT_DB)
  const perdidaEmpalme = empalmes * (input.perdidaEmpalmeDb ?? EMPALME_DEFAULT_DB)
  const penalizacion = input.penalizacionDispersionDb ?? 0
  const perdidaEnlaceDb = perdidaFibra + perdidaConector + perdidaEmpalme + penalizacion
  const margenDb = presupuestoTotalDb - perdidaEnlaceDb
  const viable = margenDb >= 0

  const note = viable
    ? `Enlace viable: margen ${margenDb.toFixed(1)} dB sobre ${distanciaKm} km de ${fibra.code} (λ ${transceiver.wavelengthNm} nm).`
    : `Enlace NO viable: margen ${margenDb.toFixed(1)} dB (déficit de ${Math.abs(margenDb).toFixed(1)} dB).`
  return {
    presupuestoTotalDb: Number(presupuestoTotalDb.toFixed(1)),
    perdidaEnlaceDb: Number(perdidaEnlaceDb.toFixed(1)),
    margenDb: Number(margenDb.toFixed(1)),
    viable,
    note,
  }
}

/**
 * Transceivers canónicos (suficientes para el caso CU-09: 10 km SMF, LR).
 * Los valores son representativos y sustituibles por assertions curadas.
 */
export const TRANSCEIVERS_CANONICOS: readonly TransceiverSpec[] = [
  { code: 'sfp-10g-sr', wavelengthNm: 850, txPowerDb: -3, rxSensitivityDb: -11, mediumCode: 'mmf-om3' },
  { code: 'sfp-10g-lr', wavelengthNm: 1310, txPowerDb: 0.5, rxSensitivityDb: -14, mediumCode: 'smf-os2' },
  { code: 'sfp-10g-er', wavelengthNm: 1550, txPowerDb: 2.5, rxSensitivityDb: -15, mediumCode: 'smf-os2' },
  { code: 'sfp-25g-lr', wavelengthNm: 1310, txPowerDb: 0.5, rxSensitivityDb: -14, mediumCode: 'smf-os2' },
]