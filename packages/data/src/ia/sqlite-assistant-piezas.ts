/**
 * Piezas del adaptador SQLite del asistente IA (§21/F7): `SqliteToolContext`
 * delega aquí desde sus métodos.
 */
export { buscarEnCatalogo } from './sqlite-assistant-busqueda.js'
export { datosDeDispositivo, capasDeDispositivo, sucesoresDe, compatiblesDe } from './sqlite-assistant-dispositivos.js'
export { compararDispositivos } from './sqlite-assistant-comparacion.js'
export { construirTopologia, resolverRol, velocidadesDe } from './sqlite-assistant-topologia.js'
export { resolverEntidad } from './sqlite-assistant-resolver-entidad.js'
