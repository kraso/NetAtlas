/**
 * Claves de API pública (F8B, NET-HW-065, §31.3).
 *
 * Vive en @netatlas/server (NO en el dominio puro): usa node:crypto, y el
 * dominio debe seguir siendo agnóstico de plataforma para que la PWA del
 * navegador importe @netatlas/domain sin `node:` modules.
 *
 * Una clave es un secreto opaco `na_<aleatorio>` que el servidor NUNCA
 * almacena en claro: solo su hash SHA-256. El prefijo público (primeros 8
 * caracteres) permite identificar la clave en logs sin revelarla.
 */
import { createHash, getRandomValues } from 'node:crypto'

const ALEA = 8

/** Genera una clave API nueva `na_xxxxxxxx` (secreto en claro, única vez). */
export function generarClaveApi(existing?: Iterable<string> | (() => Iterable<string>)): string {
  const usadas = new Set(typeof existing === 'function' ? existing() : existing ?? [])
  for (let i = 0; i < 100; i++) {
    const bytes = getRandomValues(new Uint8Array(ALEA))
    const candidata = `na_${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64url').slice(0, 12)}`
    if (!usadas.has(candidata)) return candidata
  }
  throw new Error('No se pudo generar una clave única tras 100 intentos.')
}

/** Hash SHA-256 en hex (lo único que el servidor almacena). */
export function hashClaveApi(clave: string): string {
  return createHash('sha256').update(clave).digest('hex')
}

/** Prefijo público para logs/UI (p. ej. `na_AbCdEf12…`). */
export function prefijoClave(clave: string): string {
  return clave.length > 12 ? `${clave.slice(0, 8)}…` : clave
}

/** ¿Tiene forma de clave API válida? (prefijo + al menos 8 caracteres). */
export function esFormatoClaveApi(clave: string): boolean {
  return /^na_[A-Za-z0-9_-]{8,64}$/.test(clave)
}

/** Comparación en tiempo constante para evitar timing attacks. */
export function compararHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}