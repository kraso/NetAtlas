/**
 * Piezas del explorador (§10.4 / F3 / CU-02): `explore.tsx` importa desde
 * aquí en vez de desde varios módulos.
 */
export { useCatalogStore } from '../viewmodels/catalog-store.js'
export { useSearchStore } from '../viewmodels/search-store.js'
export { useServices } from '../composition-root.js'
export { ArbolCategorias } from './explore-arbol.js'
export { cargarResultados, cargarFacetas, filtrarPorFacetas, type FacetaUI } from './explore-carga.js'
export { FacetasPanel } from './explore-facetas.js'
