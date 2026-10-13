/**
 * API pública v1 (F8B, NET-HW-064/065).
 *
 * Envuelve el middleware base (`crearServidor`) y añade las rutas `/v1/*` y
 * `/openapi.json`. Cada petición autenticada con clave API (`Bearer na_…`)
 * pasa por rate limiting y se audita. El contrato OpenAPI 3.1 se sirve en
 * `/openapi.json` (§31.3).
 *
 * Aquí queda solo la canalización —puerta → autenticación → rate limit →
 * perfil → despacho → traducción → 404— en pasos cortos y nombrables; los
 * manejadores de ruta viven en `api-publica-perfil.ts` y `api-publica-usuario.ts`.
 */
import {
  auditar,
  creaVerificadorClaveApi,
  crearPerfil,
  crearRateLimiter,
  crearRateLimiterPersistente,
  documentoOpenApi,
  esFormatoClaveApi,
  extraerClave,
  manejarRutaV1,
  responderJson,
  responderNoAutorizado,
} from './api-publica-piezas.js'
import type {
  ClaveVerificada,
  ContextoV1,
  IncomingMessage,
  RateLimiter,
  RateLimiterAsync,
  RateLimitStore,
  ServerResponse,
  ServidorStore,
  SqlitePublicStore,
} from './api-publica-piezas.js'

export interface ApiPublicaOptions {
  readonly store: ServidorStore
  readonly publicStore: SqlitePublicStore
  readonly base: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly limitePorMinuto?: number
  /** Respaldo multi-nodo: si se aporta, el rate limit se persiste en BD. */
  readonly rateLimitStore?: RateLimitStore
}

type VerificaClave = (clave: string) => Promise<ClaveVerificada | undefined>

export function crearApiPublica(opts: ApiPublicaOptions) {
  const limite = opts.limitePorMinuto ?? 120
  // Multi-nodo: si hay store compartido se persiste; si no, in-memory (un nodo).
  const rateLimiter: RateLimiter | RateLimiterAsync = opts.rateLimitStore
    ? crearRateLimiterPersistente(limite, opts.rateLimitStore)
    : crearRateLimiter(limite)
  const verificaClave: VerificaClave = creaVerificadorClaveApi(opts.publicStore)

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await atenderV1(opts, rateLimiter, verificaClave, req, res)
    } catch (error) {
      // Frontera de la API v1: un fallo operativo se reporta como 500 explícito
      // (nunca se disfraza de 400) y queda en el log. La respuesta ya enviada no
      // se reescribe.
      console.error('[ERROR] API pública v1: fallo al atender la petición', { error })
      cerrarConError(res)
    }
  }
}

/**
 * Cierra la respuesta tras un fallo operativo sin reescribirla: si ya se envió
 * (o el socket murió) no se toca; si no, se responde 500 explícito.
 */
function cerrarConError(res: ServerResponse): void {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    if (!res.writableEnded && !res.destroyed) res.end()
    return
  }
  responderJson(res, 500, { error: 'error interno' })
}

/** Canalización de una petición `/v1/*`: puerta → auth → rate limit → despacho. */
async function atenderV1(
  opts: ApiPublicaOptions,
  rateLimiter: RateLimiter | RateLimiterAsync,
  verificaClave: VerificaClave,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (await fueraDeV1(opts, req, res, url.pathname)) return

  const verificada = await autenticar(verificaClave, req, res)
  if (!verificada) return

  const ctx: ContextoV1 = {
    req,
    res,
    path: url.pathname,
    url,
    verificada,
    store: opts.store,
    publicStore: opts.publicStore,
  }
  if (!(await permiteRateLimit(rateLimiter, ctx))) return
  await asegurarPerfil(ctx)
  if (await manejarRutaV1(ctx)) return
  await delegarO404(opts, ctx)
}

/**
 * Puerta de entrada: `/openapi.json` se sirve sin clave (documentación
 * pública) y todo lo que no sea `/v1/*` delega intacto en el middleware base.
 */
async function fueraDeV1(
  opts: ApiPublicaOptions,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (path === '/openapi.json') {
    responderJson(res, 200, documentoOpenApi())
    return true
  }
  if (!path.startsWith('/v1/')) {
    await opts.base(req, res)
    return true
  }
  return false
}

/** El resto de `/v1/*` exige clave API válida; responde 401 si no la hay. */
async function autenticar(
  verificaClave: VerificaClave,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<ClaveVerificada | undefined> {
  const clave = extraerClave(req)
  if (clave === undefined || !esFormatoClaveApi(clave)) {
    responderNoAutorizado(res, 'se requiere clave API (Authorization: Bearer na_…)')
    return undefined
  }
  const verificada = await verificaClave(clave)
  if (!verificada) {
    responderNoAutorizado(res, 'clave API inválida o desactivada')
    return undefined
  }
  return verificada
}

/** Rate limit por clave (identificada por prefijo/hash); 429 auditado si se supera. */
async function permiteRateLimit(
  rateLimiter: RateLimiter | RateLimiterAsync,
  ctx: ContextoV1,
): Promise<boolean> {
  const idClave = ctx.verificada.id
  const permitido = await rateLimiter.allow(idClave)
  const retryAfter = await rateLimiter.retryAfter(idClave)
  if (permitido) return true
  await auditar(ctx, 429)
  ctx.res.writeHead(429, {
    'content-type': 'application/json; charset=utf-8',
    'retry-after': String(retryAfter),
  })
  ctx.res.end(JSON.stringify({ error: 'límite de peticiones superado', retryAfter }))
  return false
}

/** Primer uso: se crea el perfil lector automáticamente (reader por defecto). */
async function asegurarPerfil(ctx: ContextoV1): Promise<void> {
  const perfil = await ctx.publicStore.obtener(ctx.verificada.sub)
  if (perfil) return
  const nuevo = crearPerfil({ id: ctx.verificada.sub, nick: ctx.verificada.prefijo })
  await ctx.publicStore.guardar(nuevo)
}

/**
 * Consultas públicas delegadas al store del catálogo (con clave válida).
 * El middleware base habla `/api/*`; aquí se traduce la versión pública a esas
 * rutas internas. Si nada encaja: 404 auditado.
 */
async function delegarO404(opts: ApiPublicaOptions, ctx: ContextoV1): Promise<void> {
  const traducida = traducirV1(ctx.url)
  if (traducida) {
    ctx.req.url = traducida
    await auditar(ctx, 200)
    await opts.base(ctx.req, ctx.res)
    return
  }
  await auditar(ctx, 404)
  responderJson(ctx.res, 404, { error: 'ruta no encontrada' })
}

/** Traduce una ruta /v1/* a la ruta interna /api/* equivalente. */
function traducirV1(targetUrl: URL): string | undefined {
  const p = targetUrl.pathname
  const suf = targetUrl.search
  if (p === '/v1/health') return `/api/health${suf}`
  if (p === '/v1/search') return `/api/search${suf}`
  if (p === '/v1/categories') return `/api/categories${suf}`
  if (p === '/v1/snapshot') return `/api/snapshot${suf}`
  const device = p.match(/^\/v1\/devices\/([^/]+)$/)
  if (device) return `/api/device/${device[1]}${suf}`
  return undefined
}
