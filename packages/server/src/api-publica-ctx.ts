/**
 * Contexto y utilidades HTTP compartidas por los manejadores de `/v1/*`
 * (API pública F8B, NET-HW-064/065). Cada manejador recibe un `ContextoV1`
 * con la petición ya autenticada (clave verificada, rate limit pasado y
 * perfil de consumidor asegurado) y responde él mismo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServidorStore } from './store.js'
import type { SqlitePublicStore } from './public-store.js'
import type { ClaveVerificada } from './verifica-clave.js'

export interface ContextoV1 {
  readonly req: IncomingMessage
  readonly res: ServerResponse
  readonly path: string
  readonly url: URL
  readonly verificada: ClaveVerificada
  readonly store: ServidorStore
  readonly publicStore: SqlitePublicStore
}

/** Respuesta JSON con el status indicado. */
export function responderJson(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(cuerpo))
}

/** 401 con el header `www-authenticate` de la autenticación por clave. */
export function responderNoAutorizado(res: ServerResponse, error: string): void {
  res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'www-authenticate': 'Bearer' })
  res.end(JSON.stringify({ error }))
}

/**
 * Auditoría best-effort del endpoint: se registra el prefijo de la clave y el
 * status, pero nunca debe tumbar la petición.
 */
export async function auditar(ctx: Pick<ContextoV1, 'publicStore' | 'verificada' | 'path'>, status: number): Promise<void> {
  try {
    await ctx.publicStore.auditar(ctx.verificada.prefijo, ctx.path, status)
  } catch (error) {
    // La auditoría nunca debe tumbar la petición, pero no puede fallar en silencio.
    console.warn('[WARN] auditoría de la API pública fallida', { endpoint: ctx.path, status, error })
  }
}

/** Extrae la clave API (`Bearer na_…` o `x-api-key`). */
export function extraerClave(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    if (token.startsWith('na_')) return token
  }
  const xKey = req.headers['x-api-key'] ?? req.headers['api-key']
  return typeof xKey === 'string' && xKey.startsWith('na_') ? xKey : undefined
}

/**
 * Parsea el cuerpo JSON esperando un objeto. Si el cuerpo no es JSON válido o
 * no es un objeto (p. ej. `null` o un array), responde 400 con `error` y
 * devuelve `undefined`: los manejadores nunca ven datos con forma inválida.
 */
export async function leerJson<T extends object>(ctx: Pick<ContextoV1, 'req' | 'res'>, error: string): Promise<T | undefined> {
  let valor: unknown
  try {
    valor = JSON.parse(await leerCuerpo(ctx.req))
  } catch {
    responderInvalido(ctx.res, error)
    return undefined
  }
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    responderInvalido(ctx.res, error)
    return undefined
  }
  return valor as T
}

/**
 * 400 de cuerpo inválido, solo si la respuesta sigue siendo escribible: una
 * petición abortada ya no tiene a quién contestarle.
 */
function responderInvalido(res: ServerResponse, error: string): void {
  if (res.writableEnded || res.destroyed) return
  responderJson(res, 400, { error })
}

/**
 * Lee el cuerpo completo de la petición como texto UTF-8. Rechaza si el stream
 * falla o si el cliente aborta (en ese caso nunca llega `end` y la promesa
 * quedaría pendiente para siempre).
 */
export function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = []
    req.on('data', (c: Buffer) => trozos.push(c))
    req.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('petición abortada por el cliente')))
  })
}
