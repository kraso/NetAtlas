/**
 * Autenticación del servidor (F8A, NET-HW-062, §22.5).
 *
 * Soporta dos métodos, ambos verificables sin dependencias:
 *  - `Bearer` estático (token compartido, para despliegues de un solo admin):
 *    NETATLAS_SERVER_TOKEN.
 *  - OIDC real: valida un JWT RS256 contra un JWKS remoto (caché en memoria).
 *    La firma se verifica con node:crypto (sin librerías). La audiencia debe
 *    coincidir con el client_id configurado; `exp` y `iat` se comprueban.
 *
 * Cualquier adaptador expone el mismo contrato: `verificar(authorization)`.
 */
import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'

const BASE64URL = /^[A-Za-z0-9_-]+$/

function base64UrlDecode(parte: string): Buffer {
  const padded = parte.padEnd(Math.ceil(parte.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64url')
}

export interface PayloadJWT {
  readonly sub: string
  readonly iss?: string
  readonly aud?: string | readonly string[]
  readonly exp?: number
  readonly iat?: number
  readonly scope?: string
}

export interface VerificacionAuth {
  readonly ok: boolean
  readonly sub?: string
  readonly motivo?: string
}

/** Contrato de verificación de credenciales (Bearer estático u OIDC). */
export interface AuthVerifier {
  verificar(autorizacion: string | undefined): Promise<VerificacionAuth>
}

/** Bearer estático: `Authorization: Bearer <token>` con token compartido. */
export class StaticBearerVerifier implements AuthVerifier {
  constructor(private readonly token: string) {}

  async verificar(autorizacion: string | undefined): Promise<VerificacionAuth> {
    if (autorizacion !== `Bearer ${this.token}`) {
      return { ok: false, motivo: 'token inválido' }
    }
    return { ok: true, sub: 'admin' }
  }
}

export interface JwkRsa {
  readonly kid: string
  readonly kty: 'RSA'
  readonly n: string
  readonly e: string
}

/** OIDC: valida JWT RS256 con exp/iat/aud contra un JWKS remoto. */
export class OidcJwtVerifier implements AuthVerifier {
  private readonly jwksCache = new Map<string, JwkRsa>()

  constructor(
    private readonly opciones: {
      readonly issuer: string
      readonly audience: string
      readonly jwksUri: string
      readonly fetchImpl?: typeof fetch
    },
  ) {}

  async verificar(autorizacion: string | undefined): Promise<VerificacionAuth> {
    if (!autorizacion || !autorizacion.startsWith('Bearer ')) {
      return { ok: false, motivo: 'faltan credenciales Bearer' }
    }
    const token = autorizacion.slice('Bearer '.length).trim()
    const partes = token.split('.')
    if (partes.length !== 3) return { ok: false, motivo: 'JWT malformado' }

    let header: { kid?: string; alg?: string }
    try {
      header = JSON.parse(base64UrlDecode(partes[0]!).toString('utf8')) as { kid?: string; alg?: string }
      if (header.alg !== 'RS256' || !header.kid) {
        return { ok: false, motivo: 'alg no soportado (se espera RS256)' }
      }
    } catch {
      return { ok: false, motivo: 'header JWT ilegible' }
    }

    const jwk = await this.jwk(header.kid)
    if (!jwk) return { ok: false, motivo: `clave kid=${header.kid} no encontrada en JWKS` }

    // Firma sobre "header.payload" en ASCII.
    const input = `${partes[0]}.${partes[1]}`
    const firma = base64UrlDecode(partes[2]!)
    const clavPub = this.rsaPublicKey(jwk)
    const valida = cryptoVerify('sha256', Buffer.from(input, 'utf8'), clavPub, firma)
    if (!valida) return { ok: false, motivo: 'firma JWT inválida' }

    let payload: PayloadJWT
    try {
      payload = JSON.parse(base64UrlDecode(partes[1]!).toString('utf8')) as PayloadJWT
    } catch {
      return { ok: false, motivo: 'payload JWT ilegible' }
    }

    // Validaciones temporales y de audiencia.
    const ahora = Math.floor(Date.now() / 1000)
    if (payload.exp !== undefined && payload.exp < ahora) return { ok: false, motivo: 'token expirado' }
    if (payload.iat !== undefined && payload.iat > ahora + 300) return { ok: false, motivo: 'iat en el futuro' }
    const aud = payload.aud
    const auds = typeof aud === 'string' ? [aud] : aud ?? []
    if (!auds.includes(this.opciones.audience)) return { ok: false, motivo: 'audiencia no coincide' }
    if (payload.iss !== undefined && payload.iss !== this.opciones.issuer) {
      return { ok: false, motivo: 'issuer no coincide' }
    }
    return { ok: true, sub: payload.sub }
  }

  private async jwk(kid: string): Promise<JwkRsa | undefined> {
    const cacheado = this.jwksCache.get(kid)
    if (cacheado) return cacheado
    const fetchImpl = this.opciones.fetchImpl ?? fetch
    const res = await fetchImpl(this.opciones.jwksUri)
    if (!res.ok) return undefined
    const body = (await res.json()) as { keys?: readonly JwkRsa[] }
    const key = body.keys?.find((k) => k.kid === kid && k.kty === 'RSA')
    if (key) this.jwksCache.set(kid, key)
    return key
  }

  private rsaPublicKey(jwk: JwkRsa): KeyObject {
    // Node soporta createPublicKey con formato JWK directamente (v15.7+).
    return createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' })
  }
}

function padRsa(valor: string): string {
  // base64url de enteros RSA suele necesitar padding '='.
  return valor.padEnd(Math.ceil(valor.length / 4) * 4, '=')
}

// Re-export para tests (firma JWT con clave privada).
export { base64UrlDecode }
export { BASE64URL }