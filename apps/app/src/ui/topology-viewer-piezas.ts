/**
 * Piezas del visor de topologías (NET-HW-033/035/037): el despachador
 * (`topology-viewer.tsx`) depende de este módulo en vez de cinco.
 */
export { useVistaEscala } from './topology-escala.js'
export type { VistaEscala } from './topology-escala.js'
export { useFlujoPaquetes } from './topology-flujo.js'
export type { FlujoPaquetes } from './topology-flujo.js'
export { usePersistenciaLayout } from './topology-layout.js'
export type { PersistenciaLayout } from './topology-layout.js'
export { construirElementosVisor, exportarDiagrama, resumenVistaAgregada } from './topology-viewer-model.js'
export type { ModoRender } from './topology-viewer-model.js'
// Tipos de terceros re-exportados para que el despachador importe de un solo sitio.
export { useNavigate } from 'react-router-dom'
export type { Core } from 'cytoscape'
export type { Topology } from '@netatlas/domain'
// Componentes UI auxiliares re-exportados.
export { CytoscapeCanvas } from './cytoscape-canvas.js'
export { capasDe } from './topology-model.js'
export { TablaTopologia } from './topology-tabla.js'
