import { describe, expect, it } from 'vitest'
import { Topology } from '@netatlas/domain'
import { elementosDeTopologia, capasDe, rutaTopologia, tablaDeTopologia } from '../src/ui/topology-model.js'

const t = Topology.create({
  slug: 'mini',
  name: 'Mini',
  kind: 'reference',
  nodes: [
    { entityType: 'device', entitySlug: 'a', x: 0, y: 0, layerHint: 3 },
    { entityType: 'device', entitySlug: 'b', x: 100, y: 0, layerHint: 2 },
    { entityType: 'category', entitySlug: 'CAT-X', x: 200, y: 0 },
  ],
  edges: [
    { from: 'device:a', to: 'device:b', label: '1G' },
    { from: 'device:b', to: 'category:CAT-X' },
  ],
})

describe('Modelo de topologías (F4)', () => {
  it('elementosDeTopologia traduce nodos y aristas a Cytoscape', () => {
    const els = elementosDeTopologia(t)
    expect(els.filter((e) => e.data.source === undefined).length).toBe(3)
    expect(els.some((e) => e.data.id === 'device:a' && (e.data.pos as { x: number }).x === 0)).toBe(true)
    expect(els.some((e) => e.data.source === 'device:b' && e.data.target === 'category:CAT-X')).toBe(true)
  })

  it('capasDe devuelve las capas presentes ordenadas', () => {
    expect(capasDe(t)).toEqual([2, 3])
  })

  it('rutaTopologia encuentra el camino no dirigido más corto', () => {
    expect(rutaTopologia(t, 'device:a', 'category:CAT-X')).toEqual(['device:a', 'device:b', 'category:CAT-X'])
    expect(rutaTopologia(t, 'device:b', 'device:a')).toEqual(['device:b', 'device:a'])
    expect(rutaTopologia(t, 'device:a', 'device:a')).toEqual(['device:a'])
    expect(rutaTopologia(t, 'device:a', 'device:no-existe')).toEqual([])
  })

  it('tablaDeTopologia expone la alternativa accesible', () => {
    const { nodos, aristas } = tablaDeTopologia(t)
    expect(nodos.length).toBe(3)
    expect(aristas.length).toBe(2)
    expect(aristas[0]?.[2]).toBe('1G')
  })
})