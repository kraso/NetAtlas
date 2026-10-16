export { CABECERA_LINEAS, construirAlcance, contarDeclaracionesImport, esDeclaracionImport } from './alcance.js'
export type { AlcanceFichero, FicheroCambiado } from './alcance.js'
export { calcularCambio, raizRepositorio, resolverBase } from './cambio.js'
export type { Cambio, Modo, OpcionesCambio } from './cambio.js'
export { CONFIG_POR_DEFECTO, leerConfig, leerReglas, parsearConfig, resolverConfig, rutaConfigGlobal } from './config.js'
export type { ConfigGate } from './config.js'
export {
  PASADAS_POR_DEFECTO,
  REINTENTOS_POR_DEFECTO,
  TIMEOUT_POR_PASADA,
  ejecutarGate,
  mapaAlcances,
} from './gate.js'
export type { OpcionesGate, ResultadoGate } from './gate.js'
export { leerPaso, peticionDe, revisar, revisarConfiguracion } from './pasadas.js'
export type { EntornoPasada } from './pasadas.js'
export { construirInforme, resumen, seccionesMecanicas } from './informe.js'
export type { DatosInforme, PasoRevision } from './informe.js'
export { interpretarRevision } from './hallazgos.js'
export type { Hallazgo, LecturaRevision, Revision, Veredicto } from './hallazgos.js'
export {
  MAX_IMPORTS,
  REGLA_IMPORTS,
  REGLA_MODULO,
  REGLA_NOMBRES,
  esFuente,
  esModuloMedible,
  esReglaMecanica,
  lineasCambiadas,
  revisarMecanicas,
} from './mecanicas.js'
export type { Mecanicas, LineaCambiada } from './mecanicas.js'
export {
  HUECO_DE_UNION,
  TOLERANCIA_LINEAS,
  contarLineasCambiadas,
  cubreLinea,
  leerHunks,
  señalaElCambio,
  unirHunks,
} from './hunks.js'
export type { Hunk, HunksPorFichero } from './hunks.js'
export { decideInstalacion } from './instalar-hook.js'
export type { AccionInstalacion, Decision } from './instalar-hook.js'
export { coincideAlgunPatron, coincidePatron, filtrarFicheros, partirPatrones } from './patrones.js'
export { construirPrompt } from './prompt.js'
export { ejecutorGga } from './proveedor.js'
export type { EjecutorRevision, PeticionRevision, ResultadoRevision } from './proveedor.js'
export {
  SIMILITUD_MINIMA,
  UMBRALES_POR_DEFECTO,
  buscarAlcance,
  clasificar,
  dentroDelCambio,
  esElMismoHallazgo,
  normalizarRuta,
  similitudDe,
} from './reproducibilidad.js'
export type { Clasificacion, Umbrales } from './reproducibilidad.js'
