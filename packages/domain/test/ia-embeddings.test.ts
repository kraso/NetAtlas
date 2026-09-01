import { describe, expect, it } from 'vitest'
import { IndiceVectorialTFIDF, tokenizar, rankingHibrido } from '../src/index.js'
import type { EntidadVectorizable, VectorTFIDF } from '../src/index.js'

const corpus: readonly EntidadVectorizable[] = [
  { slug: 'cisco-c9300-48p', texto: 'Cisco Catalyst 9300 switch multilayer capa 3 con 48 puertos 1Gbps y PoE' },
  { slug: 'mikrotik-ccr1036', texto: 'MikroTik CCR1036 router capa 3 con 8 puertos 1Gbps y 2 puertos 10Gbps SFP+' },
  { slug: 'aruba-2930f-48g', texto: 'Aruba 2930F switch capa 2 con 48 puertos PoE+' },
  { slug: 'fortinet-200f', texto: 'FortiGate 200F firewall de seguridad con 18 Gbps de throughput' },
  { slug: 'cisco-9120axi', texto: 'Cisco Catalyst 9120AXI punto de acceso wifi 6 inalámbrico' },
]

describe('Embeddings locales TF-IDF (F7, NET-HW-016)', () => {
  it('tokeniza normalizando acentos y descartando stopwords', () => {
    const tokens = tokenizar('Necesito un switch multilayer de 10 Gbps')
    expect(tokens).toContain('switch')
    expect(tokens).toContain('multilayer')
    expect(tokens).toContain('10')
    expect(tokens).not.toContain('necesito')
    expect(tokens).not.toContain('un')
  })

  it('construye índice y vectoriza entidades', () => {
    const idx = IndiceVectorialTFIDF.construir(corpus)
    expect(idx.tamaño).toBe(5)
    expect(idx.vector('cisco-c9300-48p')).toBeDefined()
    const v: VectorTFIDF = idx.vector('cisco-c9300-48p')!
    expect(Object.keys(v.pesos).length).toBeGreaterThan(0)
  })

  it('busca por similitud coseno y ordena por relevancia real', () => {
    const idx = IndiceVectorialTFIDF.construir(corpus)
    const hits = idx.buscar('switch capa 3 con puertos gigabit', 3)
    expect(hits[0]!.slug).toBe('cisco-c9300-48p')
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })

  it('firewall responde a consulta de seguridad, no a wifi', () => {
    const idx = IndiceVectorialTFIDF.construir(corpus)
    const hits = idx.buscar('firewall seguridad throughput', 2)
    expect(hits[0]!.slug).toBe('fortinet-200f')
  })

  it('coseno de vectores idénticos = 1 y disjuntos = 0', () => {
    const idx = IndiceVectorialTFIDF.construir(corpus.slice(0, 1))
    const v = idx.vector('cisco-c9300-48p')!
    expect(IndiceVectorialTFIDF.coseno(v, v)).toBeCloseTo(1, 10)
    expect(IndiceVectorialTFIDF.coseno(v, { pesos: {} })).toBe(0)
  })

  it('ranking híbrido combina léxico+vectorial y premia la evidencia cruzada', () => {
    const lexicos = [
      { slug: 'cisco-c9300-48p', score: -8.2 },
      { slug: 'aruba-2930f-48g', score: -6.1 },
      { slug: 'mikrotik-ccr1036', score: -5.5 },
    ]
    const vectoriales = [
      { slug: 'cisco-c9300-48p', score: 0.81 },
      { slug: 'mikrotik-ccr1036', score: 0.4 },
    ]
    const hibrido = rankingHibrido(lexicos, vectoriales, 3)
    expect(hibrido[0]!.slug).toBe('cisco-c9300-48p')
    expect(hibrido[0]!.fuente).toBe('ambos')
    expect(hibrido[0]!.score).toBeGreaterThan(hibrido[1]!.score)
    expect(hibrido.length).toBeLessThanOrEqual(3)
  })
})