/**
 * API pública v1 (F8B, NET-HW-064/065).
 *
 * Envuelve el middleware base (`crearServidor`) y añade las rutas `/v1/*` y
 * `/openapi.json`. Cada petición autenticada con clave API (`Bearer na_…`)
 * pasa por rate limiting y se audita. El contrato OpenAPI 3.1 se sirve en
 * `/openapi.json` (§31.3).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServidorStore } from './store.js'
import { documentoOpenApi } from './openapi.js'
import { crearRateLimiter } from './rate-limiter.js'
import { creaVerificadorClaveApi } from './verifica-clave.js'
import type { SqlitePublicStore } from './public-store.js'
import { esFormatoClaveApi, generarClaveApi } from './api-keys.js'
import { crearPerfil, crearFavorito, MAX_FAVORITOS, esEntidadValida } from '@netatlas/domain'

export interface ApiPublicaOptions {
  readonly store: ServidorStore
  readonly publicStore: SqlitePublicStore
  readonly base: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly limitePorMinuto?: number
}

export function crearApiPublica(opts: ApiPublicaOptions) {
  const rateLimiter = crearRateLimiter(opts.limitePorMinuto ?? 120)
  const verificaClave = creaVerificadorClaveApi(opts.publicStore)

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    // /openapi.json no requiere clave (documentación pública).
    if (path === '/openapi.json') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(documentoOpenApi()))
      return
    }

    // El resto de /v1/* exige clave API.
    if (!path.startsWith('/v1/')) {
      await opts.base(req, res)
      return
    }

    const clave = extraerClave(req)
    if (clave === undefined || !esFormatoClaveApi(clave)) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'www-authenticate': 'Bearer' })
      res.end(JSON.stringify({ error: 'se requiere clave API (Authorization: Bearer na_…)' }))
      return
    }
    const verificada = await verificaClave(clave)
    if (!verificada) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'www-authenticate': 'Bearer' })
      res.end(JSON.stringify({ error: 'clave API inválida o desactivada' }))
      return
    }

    // Rate limit por clave (identificada por prefijo/hash).
    const idClave = verificada.id
    if (!rateLimiter.allow(idClave)) {
      await auditarSi(opts.publicStore, verificada.prefijo, path, 429)
      res.writeHead(429, {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(rateLimiter.retryAfter(idClave)),
      })
      res.end(JSON.stringify({ error: 'límite de peticiones superado', retryAfter: rateLimiter.retryAfter(idClave) }))
      return
    }

    const perfil = await opts.publicStore.obtener(verificada.sub)
    if (!perfil) {
      // Primer uso: se crea el perfil lector automáticamente (reader por defecto).
      const nuevo = crearPerfil({ id: verificada.sub, nick: verificada.prefijo })
      await opts.publicStore.guardar(nuevo)
    }

    // ── /v1/me ──
    if (path === '/v1/me' && req.method === 'GET') {
      await auditarSi(opts.publicStore, verificada.prefijo, path, 200)
      const p = (await opts.publicStore.obtener(verificada.sub))!
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(p))
      return
    }

    // ── /v1/favorites ──
    if (path === '/v1/favorites') {
      const perfilId = verificada.sub
      if (req.method === 'GET') {
        await auditarSi(opts.publicStore, verificada.prefijo, path, 200)
        const favoritos = await opts.publicStore.favoritos(perfilId)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(favoritos))
        return
      }
      if (req.method === 'POST') {
        let entidad = ''
        try {
          const cuerpo = JSON.parse(await leerCuerpo(req)) as { entidad?: string }
          entidad = cuerpo.entidad ?? ''
        } catch {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'JSON inválido' }))
          return
        }
        if (!esEntidadValida(entidad)) {
          await auditarSi(opts.publicStore, verificada.prefijo, path, 400)
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'entidad mal formada (se espera tipo:slug)' }))
          return
        }
        const actuales = await opts.publicStore.favoritos(perfilId)
        if (actuales.length >= MAX_FAVORITOS) {
          await auditarSi(opts.publicStore, verificada.prefijo, path, 429)
          res.writeHead(429, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: `límite de favoritos (${MAX_FAVORITOS})` }))
          return
        }
        const favorito = crearFavorito(perfilId, entidad)
        await opts.publicStore.agregarFavorito(favorito)
        await auditarSi(opts.publicStore, verificada.prefijo, path, 200)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(favorito))
        return
      }
      if (req.method === 'DELETE') {
        const entidad = url.searchParams.get('entidad') ?? ''
        await opts.publicStore.quitarFavorito(perfilId, entidad)
        await auditarSi(opts.publicStore, verificada.prefijo, path, 200)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ quitado: true }))
        return
      }
    }

    // ── /v1/keys (gestión: emitir clave) ──
    if (path === '/v1/keys' && req.method === 'POST') {
      const claveNueva = generarClaveApi()
      const id = `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      await opts.publicStore.registrarClave(id, claveNueva)
      await auditarSi(opts.publicStore, verificada.prefijo, path, 200)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ id, clave: claveNueva, nota: 'guárdala: solo se muestra una vez' }))
      return
    }

    // Consultas públicas delegadas al store del catálogo (con clave válida).
    // El middleware base habla /api/*; aquí se traduce la versión pública a
    // esas rutas internas (mismo volumen service, nueva superficie).
    const targetUrl = new URL(req.url ?? '/', 'http://localhost')
    const traducida = traducirV1(targetUrl)
    if (traducida) {
      req.url = traducida
      await auditarSi(opts.publicStore, verificada.prefijo, path, 200)
      await opts.base(req, res)
      return
    }
    await auditarSi(opts.publicStore, verificada.prefijo, path, 404)
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'ruta no encontrada' }))
  }
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

function extraerClave(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    if (token.startsWith('na_')) return token
  }
  const xKey = req.headers['x-api-key'] ?? req.headers['x-api-key']
  return typeof xKey === 'string' && xKey.startsWith('na_') ? xKey : undefined
}

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = []
    req.on('data', (c: Buffer) => trozos.push(c))
    req.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')))
    req.on('error', reject)
  })
}

async function auditarSi(store: SqlitePublicStore, prefijo: string, endpoint: string, status: number): Promise<void> {
  try {
    await store.auditar(prefijo, endpoint, status)
  } catch {
    // La auditoría nunca debe tumbar la petición.
  }
}