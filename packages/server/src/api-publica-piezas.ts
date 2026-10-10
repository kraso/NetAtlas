/**
 * Piezas de la API pública v1 (NET-HW-064/065): `api-publica.ts` importa
 * desde aquí en vez de desde 13 módulos distintos.
 */
// Tipos de terceros.
export type { IncomingMessage, ServerResponse } from 'node:http'
// Dominio.
export { crearPerfil } from '@netatlas/domain'
// Store + openapi.
export type { ServidorStore } from './store.js'
export type { SqlitePublicStore } from './public-store.js'
export { documentoOpenApi } from './openapi.js'
// Rate limiter.
export { crearRateLimiter, crearRateLimiterPersistente } from './rate-limiter.js'
export type { RateLimiter, RateLimiterAsync, RateLimitStore } from './rate-limiter.js'
// API keys.
export { esFormatoClaveApi } from './api-keys.js'
export type { ClaveVerificada } from './verifica-clave.js'
export { creaVerificadorClaveApi } from './verifica-clave.js'
// Contexto y utilidades compartidas.
export { auditar, extraerClave, responderJson, responderNoAutorizado } from './api-publica-ctx.js'
export type { ContextoV1 } from './api-publica-ctx.js'
// Despachador de rutas V1 y delegación a las rutas internas.
export { manejarRutaV1 } from './api-publica-rutas.js'
export { delegarO404, type DelegacionPublica } from './api-publica-delegacion.js'
