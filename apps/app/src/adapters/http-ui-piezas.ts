/**
 * Piezas del adaptador HTTP→UI (F8B): `http-ui.ts` delega aquí desde
 * `fetchDatasetRemoto`.
 */
export { pullSnapshot, pullCategorias } from './http-ui-pull.js'
export { toDevice, toPort, parentCodeDe, derivarCatalogo } from './http-ui-mapeo.js'
export { construirRelaciones } from './http-ui-relaciones.js'
export { construirFuentes, construirAfirmaciones } from './http-ui-trazabilidad.js'
export { construirEav, construirImagenes, construirFichas } from './http-ui-recursos.js'
// Re-exports para que http-ui.ts mantenga <=5 imports.
export { DEFAULT_API } from './http-ui-tipos.js'
export type { AppServices } from '../composition-root.js'
export type { Relationship } from '@netatlas/domain'
