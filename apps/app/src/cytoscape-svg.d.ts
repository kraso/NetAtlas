/**
 * Declaración de la extensión cytoscape-svg (0.4.x no trae tipos propios).
 * Archivo global (sin export): solo declara este módulo, no toca cytoscape.
 */
declare module 'cytoscape-svg' {
  import type cytoscape from 'cytoscape'
  const extension: cytoscape.Ext
  export default extension
}