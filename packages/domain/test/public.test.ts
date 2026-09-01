import { describe, expect, it } from 'vitest'
import {
  crearPerfil,
  crearFavorito,
  esEntidadValida,
  MAX_FAVORITOS,
} from '../src/index.js'

describe('Perfiles y favoritos (F8B, NET-HW-064)', () => {
  it('crea un perfil lector válido y valida roles', () => {
    const p = crearPerfil({ id: 'u-1', nick: 'Marcos' })
    expect(p.rol).toBe('reader')
    expect(p.createdAt).toBeTruthy()
    expect(() => crearPerfil({ id: 'u', nick: 'X', rol: 'admin' as never })).toThrow()
  })

  it('valida referencias a entidades (tipo:slug)', () => {
    expect(esEntidadValida('device:cisco-c9300-48p')).toBe(true)
    expect(esEntidadValida('protocol:ospf')).toBe(true)
    expect(esEntidadValida('device:')).toBe(false)
    expect(esEntidadValida('sin-tipo')).toBe(false)
    expect(esEntidadValida('device:slug con espacios')).toBe(false)
  })

  it('crea favoritos validados y tiene un límite de abuso', () => {
    const f = crearFavorito('u-1', 'device:cisco-c9300-48p')
    expect(f.perfilId).toBe('u-1')
    expect(f.createdAt).toBeTruthy()
    expect(() => crearFavorito('u-1', 'no-valido')).toThrow()
    expect(MAX_FAVORITOS).toBeGreaterThanOrEqual(100)
  })
})