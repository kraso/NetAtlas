import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { OidcJwtVerifier, StaticBearerVerifier } from '../src/index.js'
import type { JwkRsa } from '../src/index.js'

/**
 * F8A — auth del servidor (NET-HW-062, §22.5): Bearer estático y OIDC real
 * con firma RS256 verificada con node:crypto contra un JWKS simulado.
 */

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

/** Firma un JWT RS256 con la clave privada dada (para el JWKS de prueba). */
function firmarJwt(priv: ReturnType<typeof generateKeyPairSync>['privateKey'], kid: string, payload: object): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })))
  const cuerpo = b64url(Buffer.from(JSON.stringify(payload)))
  const firma = createSign('sha256').update(`${header}.${cuerpo}`).sign(priv).toString('base64url')
  return `${header}.${cuerpo}.${firma}`
}

function parJwt(): { jwk: JwkRsa; publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']; privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'] } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const exportado = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string }
  const jwk: JwkRsa = { ...exportado, kty: 'RSA', kid: 'kid-test' }
  return { jwk, publicKey, privateKey }
}

describe('Auth del servidor (F8A, NET-HW-062)', () => {
  it('StaticBearerVerifier acepta el token correcto y rechaza otros', async () => {
    const v = new StaticBearerVerifier('secreto')
    expect((await v.verificar('Bearer secreto')).ok).toBe(true)
    expect((await v.verificar('Bearer malo')).ok).toBe(false)
    expect((await v.verificar(undefined)).ok).toBe(false)
  })

  it('OIDC valida un JWT RS256 firmado contra su JWKS (exp/aud/iss)', async () => {
    const { jwk, privateKey } = parJwt()
    const jwksUri = 'https://idp.test/jwks'
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input)
      if (url !== jwksUri) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
    }
    const v = new OidcJwtVerifier({ issuer: 'https://idp.test', audience: 'netatlas', jwksUri, fetchImpl })

    const token = firmarJwt(privateKey, 'kid-test', {
      sub: 'usuario-1',
      iss: 'https://idp.test',
      aud: 'netatlas',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    })
    const ok = await v.verificar(`Bearer ${token}`)
    expect(ok.ok).toBe(true)
    expect(ok.sub).toBe('usuario-1')
  })

  it('OIDC rechaza token de audiencia equivocada', async () => {
    const { jwk, privateKey } = parJwt()
    const fetchImpl = async (): Promise<Response> =>
      new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
    const v = new OidcJwtVerifier({ issuer: 'https://idp.test', audience: 'netatlas', jwksUri: 'https://idp.test/jwks', fetchImpl })

    const token = firmarJwt(privateKey, 'kid-test', {
      sub: 'u', aud: 'otra-app', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
    })
    expect((await v.verificar(`Bearer ${token}`)).ok).toBe(false)
  })

  it('OIDC rechaza token mal formado o sin kid', async () => {
    const v = new OidcJwtVerifier({ issuer: 'x', audience: 'a', jwksUri: 'https://idp.test/jwks', fetchImpl: async () => new Response('{}', { status: 200 }) })
    expect((await v.verificar('Bearer no-jwt')).ok).toBe(false)
    expect((await v.verificar(undefined)).ok).toBe(false)
  })

  it('OIDC falla si el JWKS no expone el kid: token expirado → rechazo sin key', async () => {
    const { jwk, privateKey } = parJwt()
    const fetchImpl = async (): Promise<Response> =>
      new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'otro' }] }), { status: 200 })
    const v = new OidcJwtVerifier({ issuer: 'x', audience: 'a', jwksUri: 'https://idp.test/jwks', fetchImpl })
    const token = firmarJwt(privateKey, 'kid-test', { sub: 'u', exp: Math.floor(Date.now() / 1000) - 100 })
    const r = await v.verificar(`Bearer ${token}`)
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('no encontrada')
  })
})