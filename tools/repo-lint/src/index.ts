export { MAX_LINEAS, contarLineas, esBarrel, listarFuentes, listarModulos, revisarRepo } from './modulos.js'
export type { InformeModulos, ViolacionModulo } from './modulos.js'
export { DIR_APP } from './modulos.js'
export { leerGlobsWorkspace, listarManifiestos, listarProyectos, revisarNombres } from './nombres.js'
export { DIR_DIST, importsDesnudos, resolublePorElNavegador, revisarBundle } from './bundle.js'
export type { InformeBundle, ViolacionBundle } from './bundle.js'
export type { InformeNombres, NombreDuplicado, NombreProyecto } from './nombres.js'
export {
  ESPECIFICADOR_INTERNO,
  SECCIONES_DEPENDENCIAS,
  revisarDependencias,
} from './dependencias.js'
export type { InformeDependencias, SeccionDependencias, ViolacionDependencia } from './dependencias.js'
export { BARREL_APLICACION, importsDeValor, revisarBarrels } from './barrels.js'
export type { ImportDeValor, InformeBarrels, ViolacionBarrel } from './barrels.js'
export { ENTRADA_APP, PREFIJO_NODE, PUERTAS_NODE, SUBRUTA_NAVEGADOR, revisarFrontera } from './frontera.js'
export type { InformeFrontera, ViolacionFrontera } from './frontera.js'
