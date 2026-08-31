import { describe, expect, it } from 'vitest'
import { Speed } from '../src/value-objects/speed.js'
import { OsiProfileValue } from '../src/value-objects/osi-profile.js'
import { requireLifecycleStatus } from '../src/value-objects/lifecycle.js'

describe('Speed', () => {
  it('convierte Gbps → Mbps y normaliza la presentación', () => {
    expect(Speed.gbps(10).toMbps()).toBe(10000)
    expect(Speed.fromMbps(1000).toGbps()).toBe(1)
    expect(Speed.gbps(10).toString()).toBe('10 Gbps')
    expect(Speed.fromMbps(500).toString()).toBe('500 Mbps')
  })

  it('compara en unidad canónica', () => {
    expect(Speed.gbps(25).compare(Speed.fromMbps(25000))).toBe(0)
    expect(Speed.gbps(10).compare(Speed.gbps(25))).toBeLessThan(0)
  })

  it('rechaza valores negativos o no finitos', () => {
    expect(() => Speed.create(-1)).toThrow()
    expect(() => Speed.create(Number.NaN)).toThrow()
  })
})

describe('OsiProfileValue', () => {
  it('construye un perfil válido de switch L2', () => {
    const p = OsiProfileValue.create({ terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 })
    expect(p.profile.terminate).toEqual([1, 2])
    expect(p.profile.primary).toBe(2)
  })

  it('rechaza capa primaria fuera de terminate', () => {
    expect(() =>
      OsiProfileValue.create({ terminate: [1, 2], transparent: [3], primary: 3 }),
    ).toThrow()
  })

  it('mapea OSI → TCP/IP (sección 8.4.1)', () => {
    const router = OsiProfileValue.create({ terminate: [1, 2, 3], transparent: [4, 5, 6, 7], primary: 3 })
    expect(router.toTcpIpLayers()).toEqual([1, 2])
    const ngfw = OsiProfileValue.create({ terminate: [1, 2, 3, 4, 5, 6, 7], transparent: [], primary: 4 })
    expect(ngfw.toTcpIpLayers()).toEqual([1, 2, 3, 4])
  })

  it('responde la consulta inversa "qué capas termina"', () => {
    const p = OsiProfileValue.create({ terminate: [1, 2], transparent: [3, 4, 5, 6, 7], primary: 2 })
    expect(p.terminatesAny([2, 3])).toBe(true)
    expect(p.terminatesAny([3])).toBe(false)
  })
})

describe('Lifecycle', () => {
  it('acepta estados canónicos', () => {
    expect(requireLifecycleStatus('current')).toBe('current')
    expect(requireLifecycleStatus('eos')).toBe('eos')
  })
  it('rechaza estados desconocidos', () => {
    expect(() => requireLifecycleStatus('obsoleto')).toThrow()
  })
})