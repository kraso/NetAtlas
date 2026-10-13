/**
 * Piezas del comparador (F5 / §18): `comparar.tsx` importa desde aquí
 * en vez de desde 8 módulos distintos.
 */
// Dominio y casos de uso compartidos.
export { etiquetaDeReporte } from '@netatlas/domain'
export type { ComparisonReport } from '@netatlas/domain'
// Import por subruta (no por el barrel del paquete): el barrel reexporta también
// el caso de importación por lote, que arrastra @netatlas/importers → @netatlas/data.
// Ese paquete es `external` en el build del navegador y dejaba un
// `import "@netatlas/data"` desnudo en el chunk de entrada: la app arrancaba en
// blanco en el build de producción (el E2E lo destapó).
export { compareDevicesUseCase } from '@netatlas/application/casos/compare-devices'
// UI de apoyo: breadcrumbs, barra, informe y exportaciones.
export { Breadcrumbs } from './breadcrumbs.js'
export { generarPdfComparacion } from './exportar-pdf.js'
export { exportarComparacionCsv } from './comparar-csv.js'
export { BarraComparar, type BarraCompararProps } from './comparar-barra.js'
export { InformeComparacion, type InformeComparacionProps } from './comparar-informe.js'
