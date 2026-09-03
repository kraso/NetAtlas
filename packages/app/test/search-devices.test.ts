import { describe, it, expect } from 'vitest'
import { dslTerminos, searchDevices } from '../src/casos/search-devices.js'

describe('dslTerminos', () => {
  it('extrae tokens con campo:valor', () => {
    expect(dslTerminos('cat:sw poe:802.3bt router')).toEqual(['cat:sw', 'poe:802.3bt'])
  })

  it('vacío sin tokens de campo', () => {
    expect(dslTerminos('switch gestionable')).toEqual([])
  })

  it('vacío para cadena vacía', () => {
    expect(dslTerminos('')).toEqual([])
  })
})

describe('searchDevices', () => {
  const mockSearchPort = {
    query: async (req: { rawQuery: string; limit: number }) => ({
      hits: [{ entityType: 'device' as const, slug: 'sw-1', name: 'Switch 1', score: 1 }],
      total: 1,
      facets: { category: [], lifecycleStatus: [], manufacturer: [] },
    }),
    suggest: async () => [],
    suggestGrouped: async () => ({}),
  }

  it('delega al puerto y proyecta hits + total + preview DSL', async () => {
    const res = await searchDevices({ search: mockSearchPort }, { rawQuery: 'cat:sw poe:802.3at', limit: 10 })
    expect(res.hits).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.dslPreview).toEqual(['cat:sw', 'poe:802.3at'])
    expect(res.loading).toBe(false)
  })

  it('propaga errores del puerto', async () => {
    const search = {
      query: async () => { throw new Error('DB caída') },
      suggest: async () => [],
      suggestGrouped: async () => ({}),
    }
    await expect(searchDevices({ search }, { rawQuery: 'x', limit: 1 })).rejects.toThrow('DB caída')
  })
})
