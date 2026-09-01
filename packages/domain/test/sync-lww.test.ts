import { describe, expect, it } from 'vitest'
import { mergeLWWporEntidad, crearOutboxEntry } from '../src/index.js'
import type { OutboxEntry } from '../src/index.js'

function entrada(entidad: string, revision: number, id = `${entidad}-${revision}`): OutboxEntry {
  return crearOutboxEntry(
    { tipo: 'nota', entidad, autor: 'u', payload: { nota: `rev ${revision}` }, revision },
    id,
    '2025-01-01',
  )
}

/**
 * F8A futuro — merge last-writer-wins por ENTIDAD (§31.5): en un lote con
 * varias revisiones de la misma entidad solo sobrevive la más alta, y
 * entidades distintas no se pisan.
 */
describe('mergeLWWporEntidad (F8A futuro, §31.5)', () => {
  it('conserva la revisión más alta por entidad', () => {
    const lote = [
      entrada('device:a', 1),
      entrada('device:a', 2),
      entrada('device:a', 3),
      entrada('device:b', 1),
    ]
    const resultado = mergeLWWporEntidad(lote)
    expect(resultado).toHaveLength(2)
    expect(resultado.find((e) => e.entidad === 'device:a')?.revision).toBe(3)
    expect(resultado.find((e) => e.entidad === 'device:b')?.revision).toBe(1)
  })

  it('el resultado es estable y determinista (orden por entidad)', () => {
    const [a, b] = [
      mergeLWWporEntidad([entrada('x', 1), entrada('x', 5), entrada('y', 2)]),
      mergeLWWporEntidad([entrada('y', 2), entrada('x', 5), entrada('x', 1)]),
    ]
    expect(a).toEqual(b)
    expect(a.map((e) => [e.entidad, e.revision])).toEqual([['x', 5], ['y', 2]])
  })

  it('lote vacío → vacío', () => {
    expect(mergeLWWporEntidad([])).toEqual([])
  })
})