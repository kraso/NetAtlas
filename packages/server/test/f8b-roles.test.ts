import { describe, expect, it, inject } from 'vitest'

// El servidor y los perfiles curator/reviewer los prepara f8b-setup.ts.
const { url, claves } = inject('f8b')
const { lector: claveLector, curator: claveCurator, reviewer: claveReviewer } = claves

/** Dispositivo propio de este archivo: nadie más escribe sus contribuciones. */
const ENTIDAD_PRUEBA = 'device:aruba-2930f-48g-poeplus'

describe('F8B futuro — roles curator/reviewer en la API pública (§20.5)', () => {

  it('un lector no puede contribuir (403 en /v1/contributions)', async () => {
    const r = await fetch(`${url}/v1/contributions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveLector}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entradas: [] }),
    })
    expect(r.status).toBe(403)
  })

  it('un reviewer SÍ puede contribuir (200 y aceptadas)', async () => {
    const entrada = {
      id: 'rev-1',
      tipo: 'nota',
      entidad: ENTIDAD_PRUEBA,
      autor: 'key-rev-1',
      payload: { nota: 'revisar PoE' },
      createdAt: '2025-01-01',
      revision: 1,
      status: 'pendiente',
    }
    const r = await fetch(`${url}/v1/contributions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveReviewer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entradas: [entrada] }),
    })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { aceptadas: string[] }
    expect(cuerpo.aceptadas).toEqual(['rev-1'])
  })

  it('solo el curator gestiona roles (promueve a reviewer; un lector no puede)', async () => {
    // El lector intenta promoverse: 403.
    const intentoLector = await fetch(`${url}/v1/roles`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveLector}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sub: 'key-leg-1', rol: 'curator' }),
    })
    expect(intentoLector.status).toBe(403)

    // El curator promueve al lector a reviewer: 200 y rol reflejado.
    const promocion = await fetch(`${url}/v1/roles`, {
      method: 'POST',
      headers: { authorization: `Bearer ${claveCurator}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sub: 'key-leg-1', rol: 'reviewer' }),
    })
    expect(promocion.status).toBe(200)
    const cuerpo = (await promocion.json()) as { rol: string }
    expect(cuerpo.rol).toBe('reviewer')
  })

  it('PUT /v1/me actualiza el nick (nunca el rol)', async () => {
    const r = await fetch(`${url}/v1/me`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${claveCurator}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nick: 'Curador Principal' }),
    })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { nick: string; rol: string }
    expect(cuerpo.nick).toBe('Curador Principal')
    expect(cuerpo.rol).toBe('curator')
  })
})
