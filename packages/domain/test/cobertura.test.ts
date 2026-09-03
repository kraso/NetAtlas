import { describe, expect, it } from 'vitest'
import { calcularCoberturaCritica, PASIVAS } from '../src/index.js'
import type { DispositivoCriticoInput } from '../src/index.js'

/**
 * Métrica de cobertura de DATOS CRÍTICOS (F2): throughput, protocolos y
 * compatibilidades según el plan maestro (≥80%). Pura y determinista.
 */

const d = (slug: string, categoryCode: string, assert: string[] = [], rel: string[] = []): DispositivoCriticoInput => ({
  slug,
  categoryCode,
  assertionPredicates: assert,
  relationshipPredicates: rel,
})

describe('cobertura de datos críticos (F2, ≥80%)', () => {
  it('un switch con throughput + protocolo cuenta como curado', () => {
    const r = calcularCoberturaCritica([
      d('sw-a', 'CAT-SWT-L2', ['throughput_gbps', 'supports-protocol'], []),
    ])
    expect(r.elegibles).toBe(1)
    expect(r.curados).toBe(1)
    expect(r.porcentaje).toBe(100)
  })

  it('un switch sin throughput ni protocolo queda sin curar y reporta qué falta', () => {
    const r = calcularCoberturaCritica([d('sw-b', 'CAT-SWT-L2', [], [])])
    expect(r.curados).toBe(0)
    expect(r.porcentaje).toBe(0)
    expect(r.items[0]!.faltan).toEqual(expect.arrayContaining(['throughput', 'protocolos']))
  })

  it('protocolos pueden venir de la arista supports-protocol (relación)', () => {
    const r = calcularCoberturaCritica([d('sw-c', 'CAT-SWT-L3', ['throughput_gbps'], ['supports-protocol'])])
    expect(r.curados).toBe(1)
  })

  it('los pasivos (CAT-PAS) no cuentan en el denominador', () => {
    const r = calcularCoberturaCritica([d('utp', 'CAT-PAS', [], [])])
    expect(r.elegibles).toBe(0)
    expect(r.porcentaje).toBe(0)
    expect(PASIVAS).toContain('CAT-PAS')
  })

  it('un transceptor (CAT-OPT) requiere compatibilidades, no throughput', () => {
    const conCompat = d('sfp-x', 'CAT-OPT', [], ['compatible-with'])
    const sinCompat = d('sfp-y', 'CAT-OPT', [], [])
    const r = calcularCoberturaCritica([conCompat, sinCompat])
    expect(r.items[0]!.curado).toBe(true)
    expect(r.items[1]!.faltan).toEqual(['compatibilidades'])
    expect(r.curados).toBe(1)
  })

  it('agrega el % global sobre varios dispositivos', () => {
    const r = calcularCoberturaCritica([
      d('sw-a', 'CAT-SWT-L2', ['throughput_gbps', 'supports-protocol'], []),
      d('sw-b', 'CAT-SWT-L2', [], []),
      d('fw-a', 'CAT-SEC-NGFW', ['firewall_throughput_gbps', 'supports-protocol'], []),
      d('fw-b', 'CAT-SEC-NGFW', ['firewall_throughput_gbps'], ['supports-protocol']),
    ])
    expect(r.elegibles).toBe(4)
    expect(r.curados).toBe(3)
    expect(r.porcentaje).toBe(75)
  })
})