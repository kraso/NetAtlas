/**
 * Paquete @netatlas/server (F8A): servidor de sincronización.
 * API REST + auth OIDC + adaptadores de almacenamiento (SQLite/PostgreSQL)
 * con el MISMO contrato — cero cambios en dominio ni vistas (§6.7).
 */
export { crearServidor } from './http-api.js'
export type { ApiMiddleware } from './http-api.js'
export { StaticBearerVerifier, OidcJwtVerifier } from './auth.js'
export type { AuthVerifier, VerificacionAuth, JwkRsa, PayloadJWT } from './auth.js'
export { SqliteServidorStore, SqliteExecutor } from './sqlite-store.js'
export { PostgresServidorStore, traducirParametros } from './postgres-store.js'
export type { PgDriver, PgConfig, PgConnector, PgRow } from './postgres-store.js'
export type { ServidorStore, ServerDevice, ServerHit, ServerSnapshotRow, SqlExecutor } from './store.js'
export { HttpSyncServer } from './sync-http.js'