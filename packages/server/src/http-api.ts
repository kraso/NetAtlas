/**
 * Capa HTTP del servidor de sincronización (F8A, NET-HW-062).
 *
 * Router mínimo sobre node:http (sin dependencias). Endpoints:
 *   GET  /api/health                     → {ok, version}
 *   GET  /api/device/:slug               → ficha (404 si no existe)
 *   GET  /api/search?q=&limit=           → hits + total
 *   GET  /api/categories                 → catálogo de categorías
 *   GET  /api/snapshot?since=N           → dispositivos desde versión N
 *   POST /api/contributions              → recibe outbox (auth Bearer)
 *
 * La autenticación protege POST /contributions y snapshot con versión > 0;
 * las lecturas públicas son de solo lectura (sin secretos).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServidorStore } from './store.js'
import type { AuthVerifier } from './auth.js'
import type { OutboxEntry } from '@netatlas/domain'

type Ctx = { req: IncomingMessage; url: URL }
type Resultado = { status: number; cuerpo: unknown }

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = []
    req.on('data', (c: Buffer) => trozos.push(c))
    req.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')))
    req.on('error', reject)
  })
}

type RutaRegistrada = {
  readonly patron: string
  readonly handler: (ctx: Ctx, params: readonly string[]) => Promise<Resultado>
}

export function crearServidor(
  store: ServidorStore,
  auth: AuthVerifier,
  serverVersion: string,
): ApiMiddleware {
  const rutas: RutaRegistrada[] = []

  async function authGuard(ctx: Ctx): Promise<{ sub?: string } | Resultado> {
    const verificacion = await auth.verificar(ctx.req.headers.authorization)
    if (!verificacion.ok) {
      return { status: 401, cuerpo: { error: 'no autorizado', motivo: verificacion.motivo } }
    }
    return { sub: verificacion.sub }
  }

  rutas.push({
    patron: '/api/health',
    handler: async () => ({ status: 200, cuerpo: { ok: true, nombre: 'netatlas-server', version: serverVersion } }),
  })

  rutas.push({
    patron: '/api/device/:slug',
    handler: async (_ctx, params) => {
      const slug = params[0]
      if (!slug) return { status: 400, cuerpo: { error: 'falta slug' } }
      const d = await store.describe(slug)
      if (!d) return { status: 404, cuerpo: { error: `dispositivo ${slug} no existe` } }
      return { status: 200, cuerpo: d }
    },
  })

  rutas.push({
    patron: '/api/search',
    handler: async (ctx) => {
      const q = ctx.url.searchParams.get('q') ?? ''
      const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '10'), 100)
      const hits = await store.search(q, limit)
      return { status: 200, cuerpo: { q, total: hits.length, hits } }
    },
  })

  rutas.push({
    patron: '/api/categories',
    handler: async () => ({ status: 200, cuerpo: { categorias: await store.categorias() } }),
  })

  rutas.push({
    patron: '/api/snapshot',
    handler: async (ctx) => {
      const since = Math.max(0, Number(ctx.url.searchParams.get('since') ?? '0'))
      const version = await store.version()
      const dispositivos = await store.snapshot(since)
      return { status: 200, cuerpo: { version, since, dispositivos } }
    },
  })

  rutas.push({
    patron: '/api/contributions',
    handler: async (ctx) => {
      if (ctx.req.method !== 'POST') return { status: 405, cuerpo: { error: 'método no permitido' } }
      const guard = await authGuard(ctx)
      if ('status' in guard) return guard
      let entradas: readonly OutboxEntry[]
      try {
        const cuerpo = JSON.parse(await leerCuerpo(ctx.req)) as { entradas?: readonly OutboxEntry[] }
        entradas = cuerpo.entradas ?? []
      } catch {
        return { status: 400, cuerpo: { error: 'JSON inválido' } }
      }
      if (entradas.length === 0) return { status: 400, cuerpo: { error: 'lista de contribuciones vacía' } }
      const aceptadas = await store.recibirContribuciones(entradas)
      return { status: 200, cuerpo: { aceptadas, recibidas: entradas.length } }
    },
  })

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const partes = url.pathname.split('/').filter(Boolean)
    let ruta: RutaRegistrada | undefined
    let params: readonly string[] = []
    for (const r of rutas) {
      const patron = r.patron.split('/').filter(Boolean)
      if (patron.length !== partes.length) continue
      const p: string[] = []
      let coincide = true
      for (let i = 0; i < patron.length; i++) {
        if (patron[i]!.startsWith(':')) p.push(partes[i]!)
        else if (patron[i] !== partes[i]) {
          coincide = false
          break
        }
      }
      if (coincide) {
        ruta = r
        params = p
        break
      }
    }
    if (!ruta) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'no encontrado' }))
      return
    }
    let resultado: Resultado
    try {
      resultado = await ruta.handler({ req, url }, params)
    } catch (err) {
      resultado = {
        status: 500,
        cuerpo: { error: 'error interno', detalle: err instanceof Error ? err.message : String(err) },
      }
    }
    res.writeHead(resultado.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(resultado.cuerpo))
  }
}

export interface ApiMiddleware {
  (req: IncomingMessage, res: ServerResponse): Promise<void>
}