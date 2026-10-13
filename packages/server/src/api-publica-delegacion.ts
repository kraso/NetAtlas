import type { IncomingMessage, ServerResponse } from 'node:http'
import { auditar, responderJson } from './api-publica-ctx.js'
import type { ContextoV1 } from './api-publica-ctx.js'

/**
 * Delegación de consultas públicas (F8B): el middleware base habla `/api/*`,
 * así que una ruta `/v1/*` sin manejador propio se traduce a su equivalente
 * interno y se delega con la clave ya verificada; si nada encaja, 404 auditado.
 */
export interface DelegacionPublica {
  readonly base: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

/** Traduce o responde 404 (siempre auditando el resultado). */
export async function delegarO404(opts: DelegacionPublica, ctx: ContextoV1): Promise<void> {
  const traducida = traducirV1(ctx.url)
  if (!traducida) {
    await auditar(ctx, 404)
    responderJson(ctx.res, 404, { error: 'ruta no encontrada' })
    return
  }
  ctx.req.url = traducida
  await auditar(ctx, 200)
  await opts.base(ctx.req, ctx.res)
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
  const slug = device?.[1]
  if (slug) return `/api/device/${slug}${suf}`
  return undefined
}