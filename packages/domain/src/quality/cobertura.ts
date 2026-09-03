/**
 * Métrica de cobertura de DATOS CRÍTICOS (PLAN MAESTRO §F2: «cobertura de
 * fuentes ≥80% en datos críticos», línea 1588/1649).
 *
 * Datos críticos definidos por el plan: throughput, protocolos, compatibilidades.
 * Esta función pura calcula, por dispositivo, si sus datos críticos están
 * curados (assertion con fuente, no generado sintético) y agrega el % global.
 *
 * Regla por dispositivo:
 *  - throughput: assertion `*_throughput_*` con fuente ≠ auto-generada.
 *  - protocolos: arista `supports-protocol` o assertion homónima.
 *  - compatibilidades: arista `compatible-with`/`similar-to`/`requires` curada.
 *  - Elementos pasivos (CAT-PAS) se excluyen del denominador (sin electrónica).
 *  - `requiereCompatibilidades` indica si la categoría espera compatibilidades
 *    (p. ej. transceivers frente a medios); si es false, ese ítem no resta.
 */

export type DatoCritico = 'throughput' | 'protocolos' | 'compatibilidades'

export interface DispositivoCriticoInput {
  readonly slug: string
  /** Código de categoría (p. ej. CAT-SWT-L2). */
  readonly categoryCode: string
  /** Predicados de assertion curados (con fuente, no generados). */
  readonly assertionPredicates: readonly string[]
  /** Predicados de relación/arista presentes. */
  readonly relationshipPredicates: readonly string[]
}

export interface CoberturaCriticaItem {
  readonly slug: string
  readonly categoria: string
  readonly curado: boolean
  readonly faltan: readonly DatoCritico[]
}

export interface CoberturaCriticaResultado {
  /** Dispositivos con electrónica considerados en el denominador. */
  readonly elegibles: number
  /** Dispositivos con todos sus datos críticos curados. */
  readonly curados: number
  /** % global (0..100). */
  readonly porcentaje: number
  /** Detalle por dispositivo (para el dashboard). */
  readonly items: readonly CoberturaCriticaItem[]
}

/** Categorías pasivas (medios de transmisión sin electrónica interna). */
export const PASIVAS: readonly string[] = ['CAT-PAS']

/** Categorías que esperan compatibilidades curadas (transceptores, medios). */
const CON_COMPATIBILIDAD: readonly string[] = ['CAT-OPT', 'CAT-IFC']

const THROUGHPUT_RE = /_?throughput_|^throughput_/

/** ¿Applying throughput a esta categoría? Switches/router/firewalls/NIC (no hubs). */
function esperaThroughput(categoria: string): boolean {
  if (PASIVAS.includes(categoria)) return false
  if (CON_COMPATIBILIDAD.includes(categoria)) return false
  // El hub es un repetidor de capa 1: no tiene throughput de conmutación.
  if (categoria.startsWith('CAT-SWT-HUB')) return false
  return categoria.startsWith('CAT-SWT') || categoria.startsWith('CAT-RTR') || categoria.startsWith('CAT-SEC') || categoria.startsWith('CAT-IFC') || categoria.startsWith('CAT-DCN')
}

/**
 * Calcula la cobertura de datos críticos sobre una lista de dispositivos.
 * Pura y determinista: mismo input → mismo output (testeable sin I/O).
 */
export function calcularCoberturaCritica(dispositivos: readonly DispositivoCriticoInput[]): CoberturaCriticaResultado {
  const elegibles = dispositivos.filter((d) => !PASIVAS.includes(d.categoryCode))
  const items: CoberturaCriticaItem[] = []

  for (const d of elegibles) {
    const faltan: DatoCritico[] = []
    const esModuloFisico = CON_COMPATIBILIDAD.includes(d.categoryCode)
    if (esperaThroughput(d.categoryCode) && !d.assertionPredicates.some((p) => THROUGHPUT_RE.test(p))) faltan.push('throughput')
    // Los módulos físicos (transceptores/adaptadores) no implementan protocolos.
    if (!esModuloFisico && !d.assertionPredicates.includes('supports-protocol') && !d.relationshipPredicates.includes('supports-protocol')) faltan.push('protocolos')
    if (esModuloFisico && !d.relationshipPredicates.some((p) => p === 'compatible-with' || p === 'similar-to' || p === 'requires')) faltan.push('compatibilidades')

    items.push({ slug: d.slug, categoria: d.categoryCode, curado: faltan.length === 0, faltan })
  }

  const curados = items.filter((i) => i.curado).length
  return {
    elegibles: elegibles.length,
    curados,
    porcentaje: elegibles.length > 0 ? Math.round((curados / elegibles.length) * 100) : 0,
    items,
  }
}