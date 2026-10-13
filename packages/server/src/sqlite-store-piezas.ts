/**
 * Barrel del store SQLite del servidor: reúne el detalle del snapshot y los
 * conjuntos descargables para que `sqlite-store.ts` mantenga <=5 imports
 * (regla de convenciones de AGENTS.md).
 */
export { conjuntosDeDatos } from './sqlite-store-datasets.js'
export { consultarDetalle } from './sqlite-store-detalle.js'
export { SqliteExecutor } from './sqlite-store-ejecutor.js'