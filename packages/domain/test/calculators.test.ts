import { describe, expect, it } from 'vitest'
import {
  calculePoeBudget,
  poeClassMaxW,
  maxPoePorts,
  calculeEnlaceOptico,
  FIBRAS,
  TRANSCEIVERS_CANONICOS,
  calculaSubred,
  vlsm,
  convierteVelocidad,
  formatoVelocidadHumano,
  dbmToMw,
  mwToDbm,
  ratioToDb,
  dbToRatio,
} from '../src/index.js'

describe('Calculadora PoE (NET-HW-028)', () => {
  it('clasifica las tres clases estándar', () => {
    expect(poeClassMaxW('802.3af')).toBe(15.4)
    expect(poeClassMaxW('802.3at')).toBe(30)
    expect(poeClassMaxW('802.3bt')).toBe(60)
  })

  it('presupuesto dentro: 24 puertos PoE+ en un PSE de 370 W', () => {
    const r = calculePoeBudget({ poeStandard: '802.3at', portCount: 24, pseBudgetW: 370 })
    expect(r.totalRequiredW).toBe(720)
    expect(r.withinBudget).toBe(false)
  })

  it('presupuesto con draw real por puerto (cámaras 15 W)', () => {
    const r = calculePoeBudget({ poeStandard: '802.3at', portCount: 24, pseBudgetW: 370, perPortDrawW: 15 })
    expect(r.totalRequiredW).toBe(360)
    expect(r.withinBudget).toBe(true)
  })

  it('maxPoePorts calcula la capacidad del PSE', () => {
    expect(maxPoePorts('802.3at', 370)).toBe(12)
  })
})

describe('Calculadora de enlace óptico (CU-09/CU-14)', () => {
  it('CASO CU-14: enlace 10 km SMF → LR 1310 nm con margen viable', () => {
    const smf = FIBRAS.find((f) => f.code === 'smf-os2')!
    const lr = TRANSCEIVERS_CANONICOS.find((t) => t.code === 'sfp-10g-lr')!
    expect(lr.wavelengthNm).toBe(1310)

    const r = calculeEnlaceOptico({
      distanciaKm: 10,
      fibra: smf,
      transceiver: lr,
      conectores: 2,
    })
    // Pérdida de fibra: 0.4 dB/km × 10 = 4 dB; +2 conectores (0.3 c/u) = 4.6 dB
    expect(r.perdidaEnlaceDb).toBe(4.6)
    // Presupuesto: Tx 0.5 − Rx −14 = 14.5 dB
    expect(r.presupuestoTotalDb).toBe(14.5)
    // Margen = 14.5 − 4.6 = 9.9 dB
    expect(r.margenDb).toBeCloseTo(9.9, 1)
    expect(r.viable).toBe(true)
  })

  it('enlace no viable cuando la pérdida excede el presupuesto', () => {
    const smf = FIBRAS.find((f) => f.code === 'smf-os2')!
    // SR (850 nm, presupuesto 8 dB) sobre 40 km de SMF: 0.4×40 = 16 dB > 8 dB
    const sr = TRANSCEIVERS_CANONICOS.find((t) => t.code === 'sfp-10g-sr')!
    const r = calculeEnlaceOptico({
      distanciaKm: 40,
      fibra: smf,
      transceiver: sr,
    })
    expect(r.viable).toBe(false)
    expect(r.margenDb).toBeLessThan(0)
  })

  it('rechaza distancia negativa', () => {
    expect(() =>
      calculeEnlaceOptico({
        distanciaKm: -1,
        fibra: FIBRAS[0]!,
        transceiver: TRANSCEIVERS_CANONICOS[0]!,
      }),
    ).toThrow()
  })
})

describe('Calculadora de subnetting', () => {
  it('calcula red, broadcast y rango de hosts /24', () => {
    const r = calculaSubred('192.168.1.130/24')
    expect(r.redBase).toBe('192.168.1.0')
    expect(r.broadcast).toBe('192.168.1.255')
    expect(r.primerHost).toBe('192.168.1.1')
    expect(r.ultimoHost).toBe('192.168.1.254')
    expect(r.hostsUtilizables).toBe(254)
    expect(r.mascara).toBe('255.255.255.0')
  })

  it('red /30: hosts punto a punto', () => {
    const r = calculaSubred('10.0.0.2/30')
    expect(r.redBase).toBe('10.0.0.0')
    expect(r.broadcast).toBe('10.0.0.3')
    expect(r.hostsUtilizables).toBe(2)
  })

  it('VLSM divide una /24 en tamaños decrecientes', () => {
    const redes = vlsm('10.0.0.0/24', [100, 50, 25])
    expect(redes[0]!.hostsUtilizables).toBeGreaterThanOrEqual(100)
    expect(redes[1]!.hostsUtilizables).toBeGreaterThanOrEqual(50)
    expect(redes[2]!.hostsUtilizables).toBeGreaterThanOrEqual(25)
    // No se solapan: el primer host de una subred no cae dentro de la anterior
    const red1Start = ipv4Of(redes[1]!.redBase)
    const red0End = ipv4Of(redes[0]!.broadcast)
    expect(red1Start).toBeGreaterThan(red0End)
  })
})

function ipv4Of(ip: string): number {
  return ip.split('.').map(Number).reduce((acc, p) => (acc << 8) | p, 0) >>> 0
}

describe('Conversores', () => {
  it('velocidades: 10 Gbps → 10000 Mbps', () => {
    expect(convierteVelocidad(10, 'Gbps', 'Mbps')).toBe(10000)
  })
  it('formato humano', () => {
    expect(formatoVelocidadHumano(10e9)).toBe('10.00 Gbps')
    expect(formatoVelocidadHumano(100e6)).toBe('100 Mbps')
  })
  it('dBm ↔ mW reversible', () => {
    expect(dbmToMw(0)).toBe(1)
    expect(mwToDbm(1)).toBeCloseTo(0, 5)
    expect(mwToDbm(2)).toBeCloseTo(3.01, 1)
  })
  it('ratio ↔ dB reversible', () => {
    expect(dbToRatio(ratioToDb(4))).toBeCloseTo(4, 5)
  })
})