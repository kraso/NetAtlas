/**
 * Piezas del comparador (F5 / §18): `comparar.tsx` importa desde aquí
 * en vez de desde 8 módulos distintos.
 */
// Dominio y casos de uso compartidos.
export { etiquetaDeReporte } from '@netatlas/domain'
export type { ComparisonReport } from '@netatlas/domain'
export { compareDevicesUseCase } from '@netatlas/app'
// UI de apoyo: breadcrumbs, barra, informe y exportaciones.
export { Breadcrumbs } from './breadcrumbs.js'
export { generarPdfComparacion } from './exportar-pdf.js'
export { exportarComparacionCsv } from './comparar-csv.js'
export { BarraComparar, type BarraCompararProps } from './comparar-barra.js'
export { InformeComparacion, type InformeComparacionProps } from './comparar-informe.js'
