/**
 * Las 13 pestañas de la ficha (§10.5), agrupadas: el despachador
 * (`device-sheet-pestanas.tsx`) depende de este módulo en vez de cinco.
 */
export { TabEspecificaciones, TabInterfaces, TabResumen } from './device-sheet-tabs-resumen.js'
export { TabCapas } from './device-sheet-tabs-osi.js'
export { TabCompatibilidad, TabEstandares, TabProtocolos } from './device-sheet-tabs-red.js'
export { TabArquitectura, TabCapacidades } from './device-sheet-tabs-extra.js'
export { TabDiagramas, TabDocumentacion, TabHistoria, TabReferencias } from './device-sheet-tabs-docs.js'
