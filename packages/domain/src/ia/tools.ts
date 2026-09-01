/**
 * Herramientas de function-calling expuestas al asistente (sección 21.1[5],
 * NET-HW-059). Son clientes de la capa de aplicación: la ejecución entra por
 * un `ToolContext` (provee los adaptadores) y devuelve SOLO datos planos
 * JSON-safe. Cero acceso directo a la BD desde el dominio.
 *
 * Catálogo (del plan): search_catalog, get_device, compare_devices,
 * find_compatible, build_topology, what_layers, successors.
 */
import type { HerramientaIA } from './assistant.js'

/** Contrato que el adaptador (SQLite/in-memory) debe satisfacer. */
export interface ToolContext {
  /** Ejecuta una consulta del DSL y devuelve hasta `limit` dispositivos. */
  searchCatalog(dsl: string, limit: number): Promise<readonly { slug: string; nombre: string; categoria: string }[]>
  /** Ficha plana de un dispositivo (datos + puertos + assertions). */
  getDevice(slug: string): Promise<Readonly<Record<string, unknown>> | undefined>
  /** Compara N dispositivos por ids */
  compareDevices(ids: readonly string[]): Promise<Readonly<Record<string, unknown>>>
  /** Busca compatibilidad (aristas curadas + reglas declarativas). */
  findCompatible(device: string, constraint: string | undefined): Promise<Readonly<Record<string, unknown>>>
  /** Genera y persiste una topología desde una especificación JSON validada. */
  buildTopology(spec: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>
  /** Capas OSI que termina/procesa un dispositivo. */
  whatLayers(slug: string): Promise<Readonly<Record<string, unknown>> | undefined>
  /** Sucesores/predecesores de un dispositivo (aristas curadas). */
  successors(slug: string): Promise<readonly { relacion: string; slug: string; nombre: string }[]>
  /** Resuelve un nombre comercial a slug real del catálogo (opcional). */
  resolverEntidad?(textoNormalizado: string): Promise<string | undefined>
}

/** Definición canónica de cada herramienta con su esquema de entrada. */
export const HERRAMIENTAS: readonly HerramientaIA[] = [
  {
    nombre: 'search_catalog',
    descripcion: 'Busca dispositivos en el catálogo usando el DSL de consulta (§12.2). Devuelve slugs, nombres y categorías.',
    esquemaEntrada: {
      type: 'object',
      properties: {
        dsl: { type: 'string', description: 'Consulta DSL, p. ej. "cat:sw protocolo:ospf"' },
        limit: { type: 'number', default: 5 },
      },
      required: ['dsl'],
    },
  },
  {
    nombre: 'get_device',
    descripcion: 'Devuelve la ficha plana de un dispositivo por slug (datos, puertos, fabricante).',
    esquemaEntrada: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    nombre: 'compare_devices',
    descripcion: 'Compara dos o más dispositivos por slug y devuelve el reporte de diferencias.',
    esquemaEntrada: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 2 } },
      required: ['ids'],
    },
  },
  {
    nombre: 'find_compatible',
    descripcion: 'Encuentra dispositivos compatibles con uno dado (arista compatible-with o reglas declarativas).',
    esquemaEntrada: {
      type: 'object',
      properties: {
        device: { type: 'string' },
        constraint: { type: 'string', description: 'Restricción opcional (p. ej. medio, velocidad)' },
      },
      required: ['device'],
    },
  },
  {
    nombre: 'build_topology',
    descripcion: 'Genera y persiste una topología desde una especificación JSON validada {name, nodes:[{entityType,entitySlug}], edges:[{from,to}]}.',
    esquemaEntrada: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } },
      },
      required: ['name', 'nodes', 'edges'],
    },
  },
  {
    nombre: 'what_layers',
    descripcion: 'Devuelve las capas OSI que termina y en las que es transparente un dispositivo por slug.',
    esquemaEntrada: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    nombre: 'successors',
    descripcion: 'Devuelve relaciones de sucesión (replaced-by, succeeds, precedes) de un dispositivo.',
    esquemaEntrada: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
]

export function herramientaPorNombre(nombre: string): HerramientaIA | undefined {
  return HERRAMIENTAS.find((h) => h.nombre === nombre)
}

/** Valida que una llamada tenga la herramienta y sus argumentos mínimos. */
export function esLlamadaValida(llamada: { herramienta: string }): boolean {
  return herramientaPorNombre(llamada.herramienta) !== undefined
}