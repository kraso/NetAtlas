/**
 * Rutas de consumidor de la API pública v1 (F8B): `/v1/favorites`,
 * `/v1/keys` (emisión de claves) y `/v1/datasets` (descargas firmadas,
 * §31.3). Devuelven `true` si el método les correspondía (hayan respondido
 * con éxito o con error), `false` en caso contrario.
 */
import { randomUUID } from 'node:crypto'
import { crearFavorito, MAX_FAVORITOS, esEntidadValida } from '@netatlas/domain'
import { generarClaveApi } from './api-keys.js'
import { auditar, leerJson, responderJson, type ContextoV1 } from './api-publica-ctx.js'

/** `/v1/favorites`: listado (GET), alta (POST) y baja (DELETE). */
export async function manejarFavoritos(ctx: ContextoV1): Promise<boolean> {
  const perfilId = ctx.verificada.sub
  if (ctx.req.method === 'GET') {
    await auditar(ctx, 200)
    const favoritos = await ctx.publicStore.favoritos(perfilId)
    responderJson(ctx.res, 200, favoritos)
    return true
  }
  if (ctx.req.method === 'POST') return agregarFavorito(ctx, perfilId)
  if (ctx.req.method === 'DELETE') {
    const entidad = ctx.url.searchParams.get('entidad') ?? ''
    await ctx.publicStore.quitarFavorito(perfilId, entidad)
    await auditar(ctx, 200)
    responderJson(ctx.res, 200, { quitado: true })
    return true
  }
  return false
}

async function agregarFavorito(ctx: ContextoV1, perfilId: string): Promise<boolean> {
  const entidad = await leerEntidad(ctx)
  if (entidad === undefined) return true
  if (!esEntidadValida(entidad)) {
    await auditar(ctx, 400)
    responderJson(ctx.res, 400, { error: 'entidad mal formada (se espera tipo:slug)' })
    return true
  }
  const actuales = await ctx.publicStore.favoritos(perfilId)
  if (actuales.length >= MAX_FAVORITOS) {
    await auditar(ctx, 429)
    responderJson(ctx.res, 429, { error: `límite de favoritos (${MAX_FAVORITOS})` })
    return true
  }
  const favorito = crearFavorito(perfilId, entidad)
  await ctx.publicStore.agregarFavorito(favorito)
  await auditar(ctx, 200)
  responderJson(ctx.res, 200, favorito)
  return true
}

/** Parsea el cuerpo `{ entidad }`; `undefined` si el JSON es inválido (ya respondió 400). */
async function leerEntidad(ctx: ContextoV1): Promise<string | undefined> {
  const cuerpo = await leerJson<{ entidad?: string }>(ctx, 'JSON inválido')
  if (cuerpo === undefined) return undefined
  return typeof cuerpo.entidad === 'string' ? cuerpo.entidad : ''
}

/** `/v1/keys` (POST): emite una clave nueva para el consumidor autenticado. */
export async function manejarKeys(ctx: ContextoV1): Promise<boolean> {
  if (ctx.req.method !== 'POST') return false
  const claveNueva = generarClaveApi()
  // Id opaco e impredecible (la clave en claro la genera `generarClaveApi`).
  const id = `key-${randomUUID()}`
  await ctx.publicStore.registrarClave(id, claveNueva)
  await auditar(ctx, 200)
  responderJson(ctx.res, 200, { id, clave: claveNueva, nota: 'guárdala: solo se muestra una vez' })
  return true
}

/** `/v1/datasets`: listado (GET) o descarga del dataset por nombre (GET). */
export async function manejarDatasets(ctx: ContextoV1): Promise<boolean> {
  if (ctx.req.method !== 'GET') return false
  if (ctx.path === '/v1/datasets') {
    await listarDatasets(ctx)
    return true
  }
  await descargarDataset(ctx)
  return true
}

async function listarDatasets(ctx: ContextoV1): Promise<void> {
  const datasets = await ctx.store.conjuntosDeDatos()
  const listado = datasets.map((d) => ({
    nombre: d.nombre,
    sha256: d.sha256,
    tamanoBytes: d.blob.size,
    manifiesto: d.manifiesto,
  }))
  await auditar(ctx, 200)
  responderJson(ctx.res, 200, { datasets: listado })
}

async function descargarDataset(ctx: ContextoV1): Promise<void> {
  const nombre = ctx.path.slice('/v1/datasets/'.length)
  const datasets = await ctx.store.conjuntosDeDatos()
  const d = datasets.find((x) => x.nombre === nombre)
  if (!d) {
    await auditar(ctx, 404)
    responderJson(ctx.res, 404, { error: `dataset ${nombre} no disponible` })
    return
  }
  await auditar(ctx, 200)
  ctx.res.writeHead(200, {
    'content-type': 'application/x-sqlite3',
    'content-disposition': `attachment; filename="${d.nombre}.sqlite"`,
    'content-length': String(d.blob.size),
    'x-content-sha256': d.sha256,
  })
  ctx.res.end(Buffer.from(await d.blob.arrayBuffer()))
}
