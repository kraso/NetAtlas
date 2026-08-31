import { describe, expect, it } from 'vitest'
import { Slug } from '../src/value-objects/slug.js'

describe('Slug', () => {
  it('normaliza mayúsculas, espacios y acentos de forma segura', () => {
    expect(Slug.create('Aruba 2930F').value).toBe('aruba-2930f')
  })

  it('acepta slugs canónicos', () => {
    expect(Slug.create('aruba-2930f-48g-poeplus').value).toBe('aruba-2930f-48g-poeplus')
  })

  it('rechaza caracteres inválidos', () => {
    expect(() => Slug.create('mi dispositivo!')).toThrow()
    expect(() => Slug.create('--doble')).toThrow()
    expect(() => Slug.create('trailing-')).toThrow()
  })

  it('es inmutable y comparable', () => {
    const a = Slug.create('abc-1')
    const b = Slug.create('ABC 1')
    expect(a.equals(b)).toBe(true)
    expect(a.value).toBe('abc-1')
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('from() construye sin validar (para hidratación desde persistencia)', () => {
    expect(Slug.from('ya-persistido').value).toBe('ya-persistido')
  })
})