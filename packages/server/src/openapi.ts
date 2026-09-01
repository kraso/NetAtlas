/**
 * Especificación OpenAPI 3.1 de la API pública (F8B, NET-HW-065, §31.3).
 *
 * Se sirve en `GET /openapi.json` para que terceros generen clientes. Los
 * endpoints de consulta son de solo lectura y públicos; los de escritura
 * (favoritos, contribuciones) requieren la clave API (`na_…`).
 */
import type { ServidorStore } from './store.js'

export const META_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'NetAtlas API',
    version: '0.1.0',
    description:
      'Enciclopedia técnica de hardware de redes (plan maestro NetAtlas §31.3). ' +
      'Consulta del catálogo validado con trazabilidad de fuentes; credenciales: API key `na_…` en el header `Authorization: Bearer <clave>`.',
  },
  servers: [{ url: 'https://api.netatlas.local/v1', description: 'API pública v1' }],
} as const

/** Esquemas reutilizables. */
export const ESQUEMAS = {
  Device: {
    type: 'object',
    required: ['slug', 'name', 'manufacturerSlug', 'categoryCode', 'categoryName', 'lifecycleStatus'],
    properties: {
      slug: { type: 'string', example: 'cisco-catalyst-9300-48p' },
      name: { type: 'string' },
      manufacturerSlug: { type: 'string' },
      categoryCode: { type: 'string' },
      categoryName: { type: 'string' },
      lifecycleStatus: { type: 'string', enum: ['announced', 'current', 'mature', 'eol', 'eos', 'legacy', 'discontinued'] },
    },
  },
  SearchHit: {
    type: 'object',
    required: ['slug', 'name', 'score'],
    properties: {
      slug: { type: 'string' },
      name: { type: 'string' },
      score: { type: 'number' },
    },
  },
  SearchResponse: {
    type: 'object',
    properties: {
      q: { type: 'string' },
      total: { type: 'integer' },
      hits: { type: 'array', items: { $ref: '#/components/schemas/SearchHit' } },
    },
  },
  Categoria: {
    type: 'object',
    properties: { code: { type: 'string' }, nameEs: { type: 'string' } },
  },
  Favorito: {
    type: 'object',
    required: ['perfilId', 'entidad', 'createdAt'],
    properties: {
      perfilId: { type: 'string' },
      entidad: { type: 'string', example: 'device:cisco-catalyst-9300-48p' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Error: {
    type: 'object',
    required: ['error'],
    properties: { error: { type: 'string' } },
  },
} as const

/** Rutas de la API pública (lectura pública por diseño; escritura con clave). */
export const RUTAS_OPENAPI: Record<string, unknown> = {
  '/v1/devices/{slug}': {
    get: {
      summary: 'Ficha de un dispositivo por slug',
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Ficha del dispositivo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Device' } } } },
        '404': { description: 'Dispositivo no existe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/v1/search': {
    get: {
      summary: 'Busca en el catálogo (DSL o texto libre)',
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Consulta DSL o texto libre (§12.2)' },
        { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100, default: 10 } },
      ],
      responses: {
        '200': { description: 'Resultados', content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchResponse' } } } },
      },
    },
  },
  '/v1/categories': {
    get: {
      summary: 'Catálogo cerrado de categorías',
      responses: {
        '200': { description: 'Categorías', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Categoria' } } } } },
      },
    },
  },
  '/v1/favorites': {
    get: {
      summary: 'Favoritos del consumidor autenticado',
      security: [{ apiKey: [] }],
      responses: {
        '200': { description: 'Lista de favoritos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Favorito' } } } } },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
    post: {
      summary: 'Añade un favorito (entidad tipo:slug validada)',
      security: [{ apiKey: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['entidad'], properties: { entidad: { type: 'string' } } } } },
      },
      responses: {
        '200': { description: 'Favorito añadido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Favorito' } } } },
        '400': { description: 'Entidad mal formada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
    delete: {
      summary: 'Quita un favorito (entidad como body o querystring)',
      security: [{ apiKey: [] }],
      parameters: [{ name: 'entidad', in: 'query', required: false, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Favorito quitado (o inexistente)' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/v1/me': {
    get: {
      summary: 'Perfil del consumidor autenticado',
      security: [{ apiKey: [] }],
      responses: {
        '200': { description: 'Perfil' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/openapi.json': {
    get: {
      summary: 'Esta especificación OpenAPI 3.1',
      responses: { '200': { description: 'OpenAPI document' } },
    },
  },
}

/** Monta la especificación completa. */
export function documentoOpenApi(): Record<string, unknown> {
  return {
    ...META_OPENAPI,
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: 'Clave API emitida por el servidor (na_…)' },
      },
      schemas: ESQUEMAS,
      responses: {
        Unauthorized: { description: 'Credenciales inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    paths: RUTAS_OPENAPI,
  }
}

/** Valida que la spec responda a una consulta (usado por tests). */
export function rutaAbierta(): readonly string[] {
  return Object.keys(RUTAS_OPENAPI)
}

// Re-exporta el tipo del store para que los handlers del servidor lo compartan.
export type { ServidorStore }