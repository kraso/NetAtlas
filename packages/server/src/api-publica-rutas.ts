/**
 * Despachante de rutas `/v1/*` de la API pública (F8B): intenta el manejador
 * de cada prefijo de ruta en orden; devuelve `false` si ninguna ruta/método
 * coincide (el llamador responde 404 o delega en el middleware base).
 */
import { manejarMe, manejarRoles, manejarContribuciones } from './api-publica-perfil.js'
import { manejarFavoritos, manejarKeys, manejarDatasets } from './api-publica-usuario.js'
import type { ContextoV1 } from './api-publica-ctx.js'

export async function manejarRutaV1(ctx: ContextoV1): Promise<boolean> {
  if (ctx.path === '/v1/me') return manejarMe(ctx)
  if (ctx.path === '/v1/roles') return manejarRoles(ctx)
  if (ctx.path === '/v1/contributions') return manejarContribuciones(ctx)
  if (ctx.path === '/v1/favorites') return manejarFavoritos(ctx)
  if (ctx.path === '/v1/keys') return manejarKeys(ctx)
  if (ctx.path === '/v1/datasets' || ctx.path.startsWith('/v1/datasets/')) return manejarDatasets(ctx)
  return false
}
