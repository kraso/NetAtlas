import { describe, expect, it } from 'vitest'
import { generateDevices } from '../src/index.js'

describe('datagen', () => {
  it('genera el número solicitado de dispositivos', () => {
    const rows = generateDevices({ deviceCount: 100, seed: 7 })
    expect(rows).toHaveLength(100)
  })

  it('es determinista con la misma semilla', () => {
    const a = generateDevices({ deviceCount: 25, seed: 42 })
    const b = generateDevices({ deviceCount: 25, seed: 42 })
    expect(a).toEqual(b)
  })

  it('produce slugs únicos', () => {
    const rows = generateDevices({ deviceCount: 500, seed: 1 })
    const slugs = new Set(rows.map((r) => r.slug))
    expect(slugs.size).toBe(500)
  })

  it('incluye perfil OSI y estado de ciclo de vida válidos', () => {
    const rows = generateDevices({ deviceCount: 50, seed: 3 })
    for (const r of rows) {
      expect(r.lifecycleStatus).toMatch(/^(announced|current|mature|eol|eos|legacy|discontinued)$/)
      const profile = JSON.parse(r.osiProfileJson ?? '{}') as { terminate: number[]; primary: number }
      expect(profile.terminate.length).toBeGreaterThan(0)
      expect(profile.primary).toBeGreaterThanOrEqual(1)
      expect(profile.primary).toBeLessThanOrEqual(7)
    }
  })
})