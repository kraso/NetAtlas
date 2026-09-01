import { describe, expect, it } from 'vitest'
import { layoutPorCapas, layoutRadial, aplicarLayout } from '../src/index.js'
import type { NodoLayoutInput, PosicionLayout } from '../src/index.js'

const nodos: readonly NodoLayoutInput[] = [
  { id: 'device:a', layerHint: 2 },
  { id: 'device:b', layerHint: 2 },
  { id: 'device:c', layerHint: 3 },
  { id: 'device:d', layerHint: 3 },
  { id: 'device:e', layerHint: 3 },
]

describe('Layouts deterministas (F4 refinamiento)', () => {
  it('layoutPorCapas: cada capa en su fila y nodos centrados', () => {
    const pos = layoutPorCapas(nodos)
    const capa2 = pos.filter((p) => p.id === 'device:a' || p.id === 'device:b')
    const capa3 = pos.filter((p) => p.id === 'device:c' || p.id === 'device:d' || p.id === 'device:e')
    // Misma fila (y) dentro de cada capa; filas distintas entre capas.
    expect(capa2[0]!.y).toBe(capa2[1]!.y)
    expect(capa3[0]!.y).toBe(capa3[1]!.y)
    expect(capa3[0]!.y).toBeGreaterThan(capa2[0]!.y)
    // Capa 2 centrada: −sx/2 y +sx/2 alrededor de 0 (2 nodos).
    expect(capa2.map((p) => p.x).sort((a, b) => a - b)).toEqual([-45, 45])
  })

  it('layoutPorCapas es determinista (mismas entradas → mismas salidas)', () => {
    expect(layoutPorCapas(nodos)).toEqual(layoutPorCapas(nodos))
  })

  it('layoutRadial distribuye en círculo sin solapamiento de ids', () => {
    const pos = layoutRadial(nodos)
    expect(pos).toHaveLength(5)
    const ids = new Set(pos.map((p) => p.id))
    expect(ids.size).toBe(5)
    // El primer nodo queda en (radio, 0); la esquina es un punto del círculo.
    expect(pos[0]!.x).toBe(220)
    expect(pos[0]!.y).toBe(0)
  })

  it('aplicarLayout elige capas o radial', () => {
    expect(aplicarLayout('capas', nodos)[0]!.y).toBe(130) // capa 2 → y=(2-1)*130
    expect(aplicarLayout('radial', nodos)[0]!.x).toBe(220)
    void ([] as readonly PosicionLayout[]) // noop tipo
  })
})