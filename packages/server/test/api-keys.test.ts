import { describe, expect, it } from 'vitest'
import {
  generarClaveApi,
  hashClaveApi,
  prefijoClave,
  esFormatoClaveApi,
  compararHashes,
} from '../src/index.js'

/**
 * Claves de API (F8B, NET-HW-065) — viven en @netatlas/server porque usan
 * node:crypto; el dominio sigue siendo agnóstico de plataforma para la PWA.
 */
describe('Claves de API (F8B, NET-HW-065)', () => {
  it('genera claves con prefijo na_ y formato válido, únicas entre sí', () => {
    const a = generarClaveApi()
    const b = generarClaveApi([a])
    expect(esFormatoClaveApi(a)).toBe(true)
    expect(a.startsWith('na_')).toBe(true)
    expect(a).not.toBe(b)
  })

  it('solo guarda el hash SHA-256, nunca el secreto en claro', () => {
    const clave = generarClaveApi()
    const hash = hashClaveApi(clave)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(clave).not.toContain(hash)
    expect(hashClaveApi(clave)).toBe(hash) // determinista
  })

  it('el prefijo público no revela el secreto completo', () => {
    const prefijo = prefijoClave('na_AbCdEf123456789')
    expect(prefijo).not.toContain('AbCdEf123456789')
    expect(prefijo).toBe('na_AbCdE…')
  })

  it('rechaza claves mal formadas y compara hashes en tiempo constante', () => {
    expect(esFormatoClaveApi('token-plano')).toBe(false)
    expect(esFormatoClaveApi('na_abc')).toBe(false)
    expect(compararHashes('a'.repeat(64), 'b'.repeat(64))).toBe(false)
    expect(compararHashes('a'.repeat(64), 'a'.repeat(64))).toBe(true)
  })
})