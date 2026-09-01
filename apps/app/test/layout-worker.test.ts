import { describe, expect, it } from 'vitest'
import { calcularLayoutEnWorker, posicionesPorId } from '../src/workers/layout-worker-client.js'

/**
 * F4 refinamiento — Web Worker de layouts: en jsdom no hay `Worker`, así que
 * el cliente cae al cálculo síncrono del mismo código del dominio. Se verifica
 * el contrato (promesa con posiciones) y la utilidad de mapeo por id.
 */
describe('Cliente del Worker de layouts (F4)', () => {
  it('sin Worker (jsdom) resuelve posiciones con el fallback síncrono del dominio', async () => {
    expect(typeof Worker).toBe('undefined') // jsdom
    const posiciones = await calcularLayoutEnWorker({
      nodos: [
        { id: 'device:a', layerHint: 2 },
        { id: 'device:b', layerHint: 2 },
        { id: 'device:c', layerHint: 3 },
      ],
    })
    expect(posiciones).toHaveLength(3)
    const porId = posicionesPorId(posiciones)
    expect(porId.get('device:a')!.x).toBe(-45)
    expect(porId.get('device:c')!.y).toBe(260) // (3-1)*130
  })

  it('posicionesPorId mapea todos los ids de forma única', async () => {
    const posiciones = await calcularLayoutEnWorker({
      nodos: [
        { id: 'a', layerHint: 1 },
        { id: 'b', layerHint: 1 },
        { id: 'c', layerHint: 4 },
      ],
    })
    const mapa = posicionesPorId(posiciones)
    expect(mapa.size).toBe(3)
    expect(mapa.has('a')).toBe(true)
    expect(mapa.has('c')).toBe(true)
  })
})