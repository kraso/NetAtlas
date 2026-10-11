import { describe, expect, it, inject } from 'vitest'
import { generarClaveApi, hashClaveApi } from '../src/api-keys.js'
import { rutaAbierta } from '../src/index.js'

// Servidor y claves comunes a los tres archivos F8B (ver f8b-setup.ts).
const { url, claves } = inject('f8b')
const claveTercero = claves.tercero

/**
 * CRITERIO F8B (§27): "Terceros consumen la API con clave" (§31.3).
 * API pública /v1 · OpenAPI 3.1 servida · clave API (solo hash) · rate limit.
 * Sin clave → los endpoints /v1 rechazan.
 */
describe('F8B — API pública con clave (NET-HW-065/064, criterio)', () => {
  it('la clave emitida al tercero tiene el prefijo público (solo se guarda el hash)', () => {
    expect(claveTercero.startsWith('na_')).toBe(true)
  })

  it('el documento OpenAPI 3.1 se sirve sin clave y declara las rutas', async () => {
    const r = await fetch(`${url}/openapi.json`)
    expect(r.status).toBe(200)
    const spec = (await r.json()) as { openapi: string; info: { title: string }; paths: Record<string, unknown> }
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info.title).toContain('NetAtlas')
    for (const ruta of rutaAbierta()) {
      expect(spec.paths[ruta]).toBeDefined()
    }
  })

  it('sin clave → /v1/me rechaza con 401', async () => {
    const r = await fetch(`${url}/v1/me`)
    expect(r.status).toBe(401)
  })

  it('con clave → el tercero consulta el catálogo (criterio: API con clave)', async () => {
    const r = await fetch(`${url}/v1/search?q=9300&limit=5`, {
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { q: string; total: number; hits: unknown[] }
    expect(body.total).toBeGreaterThan(0)
  })

  it('con clave → ficha y categorías públicas', async () => {
    const device = await fetch(`${url}/v1/devices/cisco-catalyst-9300-48p`, {
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(device.status).toBe(200)
    const cats = await fetch(`${url}/v1/categories`, {
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(cats.status).toBe(200)
  })

  it('favoritos: añadir, listar y quitar con la clave del tercero', async () => {
    const entidad = 'device:cisco-catalyst-9300-48p'
    const add = await fetch(`${url}/v1/favorites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveTercero}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entidad }),
    })
    expect(add.status).toBe(200)
    const list = await fetch(`${url}/v1/favorites`, { headers: { authorization: `Bearer ${claveTercero}` } })
    const favoritos = (await list.json()) as { entidad: string }[]
    expect(favoritos.some((f) => f.entidad === entidad)).toBe(true)

    const del = await fetch(`${url}/v1/favorites?entidad=${encodeURIComponent(entidad)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${claveTercero}` },
    })
    expect(del.status).toBe(200)
  })

  it('entidad mal formada en favorito → 400', async () => {
    const r = await fetch(`${url}/v1/favorites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveTercero}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entidad: 'mal-formada' }),
    })
    expect(r.status).toBe(400)
  })

  it('la clave solo se almacena como hash (nunca el secreto en claro)', async () => {
    const hash = hashClaveApi(claveTercero)
    // El prefijo público en la BD es distinto del secreto completo.
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(claveTercero).not.toContain(hash)
    // Y una clave distinta tiene hash distinto.
    const otra = generarClaveApi()
    expect(hashClaveApi(otra)).not.toBe(hash)
  })

  it('rate limit: al superar el límite responde 429 con retry-after', async () => {
    // Límite 10/minuto; se lanzan 12 peticiones inmediatas.
    let ultimoStatus = 0
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${url}/v1/search?q=sw`, {
        headers: { authorization: `Bearer ${claveTercero}` },
      })
      ultimoStatus = r.status
      if (r.status === 429) {
        expect(r.headers.get('retry-after')).toBeTruthy()
        break
      }
    }
    expect(ultimoStatus).toBe(429)
  })
})
