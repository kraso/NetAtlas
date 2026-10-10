/**
 * Piezas de las que se compone la vista del mapa global (NET-HW-036):
 * canvas de Cytoscape, migas, lógica de posiciones y tablas accesibles.
 * El barrel reduce el grafo de imports de `mapa-global.tsx` a una entrada.
 */
export { CytoscapeCanvas } from './cytoscape-canvas.js'
export { Breadcrumbs } from './breadcrumbs.js'
export { elementsDelMapa, posicionesDeVariante } from './mapa-global-logica.js'
export { CategoriasAccesibles, EnlacesAccesibles } from './mapa-global-tablas.js'
