import { describe, it, expect } from 'vitest'
import { manageFavorites } from '../src/casos/manage-favorites.js'
import type { FavoritesPort } from '../src/index.js'
import type { Favorito } from '@netatlas/domain'

function makePort(state: Favorito[]): FavoritesPort & { _state: Favorito[]; calls: string[] } {
  const calls: string[] = []
  const _state = [...state]
  return {
    _state,
    calls,
    async list() { calls.push('list'); return [..._state] },
    async add(entidad) { calls.push(`add:${entidad}`); _state.push({ perfilId: 'test', entidad, createdAt: '2025-01-01' }) },
    async remove(entidad) { calls.push(`remove:${entidad}`); const i = _state.findIndex((f) => f.entidad === entidad); if (i >= 0) _state.splice(i, 1) },
  }
}

describe('manageFavorites', () => {
  it('agrega un favorito nuevo', async () => {
    const port = makePort([])
    const res = await manageFavorites({ favorites: port }, { entidad: 'device:sw-1', action: 'add' })
    expect(res.added).toBe(true)
    expect(res.favoritos).toHaveLength(1)
    expect(port.calls).toContain('list')
    expect(port.calls).toContain('add:device:sw-1')
  })

  it('quita un favorito existente', async () => {
    const port = makePort([{ perfilId: 'test', entidad: 'device:sw-1', createdAt: '2025-01-01' }])
    const res = await manageFavorites({ favorites: port }, { entidad: 'device:sw-1', action: 'remove' })
    expect(res.added).toBe(false)
    expect(res.favoritos).toHaveLength(0)
    expect(port.calls).toContain('remove:device:sw-1')
  })

  it('rechaza entidad mal formada', async () => {
    const port = makePort([])
    await expect(
      manageFavorites({ favorites: port }, { entidad: 'no-es-valido', action: 'add' }),
    ).rejects.toThrow('entidad mal formada')
  })
})
