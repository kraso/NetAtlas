/**
 * Rutas de perfil y gobernanza de la API pública v1 (F8B): `/v1/me`,
 * `/v1/roles` (curator) y `/v1/contributions` (escritura gobernada §20.5).
 * Cada manejador devuelve `true` si ha respondido (o respondido con error)
 * y `false` si el método no le corresponde.
 *
 * Los cuerpos inválidos se validan de forma explícita y responden 400; los
 * fallos operativos del store NO se disfrazan de error del cliente: suben
 * hasta la frontera de la API, que responde 500 (ver `api-publica.ts`).
 */
import { crearPerfil, esRolPerfil } from '@netatlas/domain'
import type { OutboxEntry, PerfilUsuario, RolPerfil } from '@netatlas/domain'
import { auditar, leerJson, responderJson, type ContextoV1 } from './api-publica-ctx.js'

/** `/v1/me`: consulta (GET) y actualización de nick (PUT; el rol lo gobierna un curator). */
export async function manejarMe(ctx: ContextoV1): Promise<boolean> {
  if (ctx.req.method === 'GET') {
    await auditar(ctx, 200)
    responderJson(ctx.res, 200, await perfilDe(ctx))
    return true
  }
  if (ctx.req.method === 'PUT') {
    await actualizarNick(ctx)
    return true
  }
  return false
}

async function actualizarNick(ctx: ContextoV1): Promise<void> {
  const cuerpo = await leerJson<{ nick?: string }>(ctx, 'cuerpo inválido (nick requerido)')
  if (cuerpo === undefined) return
  const actual = await perfilDe(ctx)
  const nick = cuerpo.nick ?? actual.nick
  if (!esNickValido(nick)) {
    responderJson(ctx.res, 400, { error: 'cuerpo inválido (nick requerido)' })
    return
  }
  const actualizado = crearPerfil({ id: actual.id, nick, rol: actual.rol, createdAt: actual.createdAt })
  await ctx.publicStore.guardar(actualizado)
  await auditar(ctx, 200)
  responderJson(ctx.res, 200, actualizado)
}

/** `/v1/roles` (POST): asignar rol; requiere rol curator. */
export async function manejarRoles(ctx: ContextoV1): Promise<boolean> {
  if (ctx.req.method !== 'POST') return false
  const llamador = await perfilDe(ctx)
  if (llamador.rol !== 'curator') {
    await auditar(ctx, 403)
    responderJson(ctx.res, 403, { error: 'se requiere rol curator para gestionar roles' })
    return true
  }
  await aplicarRol(ctx)
  return true
}

async function aplicarRol(ctx: ContextoV1): Promise<void> {
  const cuerpo = await leerJson<{ sub?: string; rol?: string }>(ctx, 'cuerpo inválido')
  if (cuerpo === undefined) return
  if (!esSubValido(cuerpo.sub) || !esRolPerfil(cuerpo.rol ?? '')) {
    responderJson(ctx.res, 400, { error: 'sub y rol válido (.reader|reviewer|curator) requeridos' })
    return
  }
  const objetivo = (await ctx.publicStore.obtener(cuerpo.sub)) ?? crearPerfil({ id: cuerpo.sub, nick: cuerpo.sub })
  const actualizado = crearPerfil({
    id: objetivo.id,
    nick: objetivo.nick,
    rol: cuerpo.rol as RolPerfil,
    createdAt: objetivo.createdAt,
  })
  await ctx.publicStore.guardar(actualizado)
  await auditar(ctx, 200)
  responderJson(ctx.res, 200, actualizado)
}

/** `/v1/contributions` (POST): recibe outbox; requiere rol reviewer o curator. */
export async function manejarContribuciones(ctx: ContextoV1): Promise<boolean> {
  if (ctx.req.method !== 'POST') return false
  const autor = await perfilDe(ctx)
  if (autor.rol !== 'reviewer' && autor.rol !== 'curator') {
    await auditar(ctx, 403)
    responderJson(ctx.res, 403, { error: 'se requiere rol reviewer o curator para contribuir' })
    return true
  }
  const entradas = await leerEntradas(ctx)
  if (entradas === undefined) return true
  if (entradas.length === 0) {
    responderJson(ctx.res, 400, { error: 'lista de contribuciones vacía' })
    return true
  }
  const aceptadas = await ctx.store.recibirContribuciones(entradas)
  await auditar(ctx, 200)
  responderJson(ctx.res, 200, { aceptadas, recibidas: entradas.length })
  return true
}

/**
 * Perfil del consumidor autenticado. El pipeline lo asegura antes de
 * despachar; si aun así falta, rompe fuerte y el fallo se reporta como 500.
 */
async function perfilDe(ctx: ContextoV1): Promise<PerfilUsuario> {
  const perfil = await ctx.publicStore.obtener(ctx.verificada.sub)
  if (!perfil) throw new Error(`API pública: perfil ausente para "${ctx.verificada.sub}".`)
  return perfil
}

/**
 * Parsea el cuerpo `{ entradas }` validando su forma: se espera un array de
 * contribuciones con los campos de `OutboxEntry` (el JSON es ajeno).
 * Devuelve `undefined` si ya respondió 400.
 */
async function leerEntradas(ctx: ContextoV1): Promise<readonly OutboxEntry[] | undefined> {
  const cuerpo = await leerJson<{ entradas?: unknown }>(ctx, 'JSON inválido')
  if (cuerpo === undefined) return undefined
  const entradas = cuerpo.entradas ?? []
  if (!Array.isArray(entradas) || !entradas.every(esEntradaValida)) {
    responderJson(ctx.res, 400, { error: 'contribuciones mal formadas' })
    return undefined
  }
  return entradas
}

/** ¿Tiene forma de contribución del outbox? Validación explícita del JSON recibido. */
function esEntradaValida(valor: unknown): valor is OutboxEntry {
  if (typeof valor !== 'object' || valor === null) return false
  const e = valor as Record<string, unknown>
  return (
    typeof e['id'] === 'string' &&
    typeof e['tipo'] === 'string' &&
    typeof e['entidad'] === 'string' &&
    typeof e['autor'] === 'string' &&
    typeof e['createdAt'] === 'string' &&
    typeof e['revision'] === 'number' &&
    Number.isInteger(e['revision']) &&
    typeof e['payload'] === 'object' &&
    e['payload'] !== null
  )
}

/** El nick debe tener ≥ 2 caracteres (misma regla que el agregado del dominio). */
function esNickValido(nick: unknown): nick is string {
  return typeof nick === 'string' && nick.trim().length >= 2
}

/** El `sub` objetivo debe ser una identidad usable como nick de perfil. */
function esSubValido(sub: unknown): sub is string {
  return typeof sub === 'string' && sub.trim().length >= 2
}
