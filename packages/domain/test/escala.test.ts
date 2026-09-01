import { describe, expect, it } from 'vitest'
import {
  UMBRAL_AGREGACION,
  UMBRAL_CANVAS,
  decidirModoRender,
  agregarTopologia,
} from '../src/index.js'
import type { NodoFuente, AristaFuente } from '../src/index.js'

const resolverCat: (s: string) => string | undefined = (s) => {
  if (s.startsWith('sw-')) return 'CAT-SWT'
  if (s.startsWith('rtr-')) return 'CAT-RTR'
  return undefined
}

describe('Escalado de topologías (F4 refinamiento, ADR-03)', () => {
  it('decidirModoRender respeta los umbrales documentados', () => {
    expect(decidirModoRender(10)).toBe('svg')
    expect(decidirModoRender(UMBRAL_AGREGACION - 1)).toBe('svg')
    expect(decidirModoRender(UMBRAL_AGREGACION)).toBe('agregado')
    expect(decidirModoRender(UMBRAL_CANVAS - 1)).toBe('agregado')
    expect(decidirModoRender(UMBRAL_CANVAS)).toBe('canvas')
  })

  it('agrega dispositivos por categoría en supernodos con conteo', () => {
    const nodos: NodoFuente[] = [
      { id: 'device:sw-a', entityType: 'device', entitySlug: 'sw-a', layerHint: 2 },
      { id: 'device:sw-b', entityType: 'device', entitySlug: 'sw-b', layerHint: 2 },
      { id: 'device:rtr-x', entityType: 'device', entitySlug: 'rtr-x', layerHint: 3 },
      { id: 'device:huérfano', entityType: 'device', entitySlug: 'huérfano', layerHint: 1 },
    ]
    const aristas: AristaFuente[] = [
      { from: 'device:sw-a', to: 'device:rtr-x' },
      { from: 'device:sw-b', to: 'device:rtr-x' },
      { from: 'device:sw-a', to: 'device:huérfano' },
    ]

    const a = agregarTopologia(nodos, aristas, resolverCat)
    expect(a.nodosOriginales).toBe(4)
    expect(a.esAgregada).toBe(false) // tamaño chico: no fuerza agrupación
    const grupoSw = a.nodos.find((n) => n.id === 'grupo:CAT-SWT')
    expect(grupoSw?.tipo).toBe('grupo')
    expect(grupoSw?.cantidad).toBe(2)
    expect(grupoSw?.capa).toBe(2)
    expect(a.nodos.find((n) => n.id === 'grupo:CAT-RTR')?.cantidad).toBe(1)
    // El huérfano sin categoría queda suelto (no es grupo).
    expect(a.nodos.find((n) => n.id === 'dispositivo:huérfano')?.tipo).toBe('dispositivo')
    // Aristas resumidas: sw→rtr = 2, sw→huérfano = 1.
    const swRtr = a.aristas.find((e) => (e.from === 'grupo:CAT-SWT' && e.to === 'grupo:CAT-RTR') || (e.from === 'grupo:CAT-RTR' && e.to === 'grupo:CAT-SWT'))
    expect(swRtr?.cantidad).toBe(2)
  })

  it('descarta bucles dentro del mismo grupo (a === b)', () => {
    const nodos: NodoFuente[] = [
      { id: 'device:sw-a', entityType: 'device', entitySlug: 'sw-a' },
      { id: 'device:sw-b', entityType: 'device', entitySlug: 'sw-b' },
    ]
    const aristas: AristaFuente[] = [{ from: 'device:sw-a', to: 'device:sw-b' }]
    const a = agregarTopologia(nodos, aristas, resolverCat)
    // sw-a y sw-b → grupo:CAT-SWT; la arista interna se descarta (from === to).
    expect(a.aristas).toHaveLength(0)
  })

  it('modo agregado explícito cuando supera el umbral (esAgregada)', () => {
    const nodos: NodoFuente[] = Array.from({ length: UMBRAL_AGREGACION }, (_, i) => ({
      id: `device:sw-${i}`,
      entityType: 'device' as const,
      entitySlug: `sw-${i}`,
      layerHint: 2,
    }))
    const a = agregarTopologia(nodos, [], resolverCat)
    expect(a.esAgregada).toBe(true)
    expect(a.nodos).toHaveLength(1) // todo en un grupo
    expect(a.nodos[0]?.cantidad).toBe(UMBRAL_AGREGACION)
  })

  it('nodos de tipo category se agrupan por su propio slug', () => {
    const nodos: NodoFuente[] = [
      { id: 'category:CAT-WLS', entityType: 'category', entitySlug: 'CAT-WLS' },
    ]
    const a = agregarTopologia(nodos, [], resolverCat)
    expect(a.nodos[0]?.id).toBe('grupo:CAT-WLS')
    expect(a.nodos[0]?.categoria).toBe('CAT-WLS')
  })
})