import { describe, expect, it } from 'vitest'
import { crearStoreMemoria } from './sqlite-prueba.js'

describe('F8A futuro — merge LWW por entidad en recibirContribuciones (§31.5)', () => {
  it('un lote con varias revisiones de la misma entidad solo persiste la más alta', async () => {
    const { db, store } = crearStoreMemoria()

    const base = { tipo: 'nota' as const, entidad: 'device:sw-a', autor: 'u', status: 'pendiente' as const }
    const lotes = [
      { ...base, id: 'l-1', revision: 1, payload: { nota: 'v1' }, createdAt: '2025-01-01' },
      { ...base, id: 'l-2', revision: 2, payload: { nota: 'v2' }, createdAt: '2025-01-02' },
      { ...base, id: 'l-3', revision: 3, payload: { nota: 'v3' }, createdAt: '2025-01-03' },
    ]

    const aceptadas = await store.recibirContribuciones(lotes)
    // Solo la revisión 3 (por entidad) es aceptada; las inferiores se descartan.
    expect(aceptadas).toEqual(['l-3'])
    const persistidas = db.prepare('SELECT id, revision FROM netatlas_contribuciones').all() as { id: string; revision: number }[]
    expect(persistidas).toHaveLength(1)
    expect(persistidas[0]!.revision).toBe(3)
    db.close()
  })

  it('una revisión entrante menor que la persistida de la misma entidad se rechaza', async () => {
    const { db, store } = crearStoreMemoria()
    const base = { tipo: 'nota' as const, entidad: 'device:sw-b', autor: 'u', status: 'pendiente' as const }

    await store.recibirContribuciones([{ ...base, id: 'a-2', revision: 2, payload: {}, createdAt: '2025-01-01' }])
    const aceptadas = await store.recibirContribuciones([{ ...base, id: 'a-1', revision: 1, payload: {}, createdAt: '2025-01-02' }])
    expect(aceptadas).toEqual([])
    const existente = db.prepare('SELECT revision FROM netatlas_contribuciones WHERE entidad = ?').get('device:sw-b') as { revision: number }
    expect(existente.revision).toBe(2)
    db.close()
  })
})
