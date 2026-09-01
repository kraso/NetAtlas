import { describe, expect, it } from 'vitest'
import { compareDevices, evaluateCompatibilidad } from '../src/index.js'
import type { CompareDeviceInput } from '../src/index.js'

function sw(slug: string, name: string, cat: string, atributos: CompareDeviceInput['attributes']): CompareDeviceInput {
  return { slug, name, categoryCode: cat, categoryName: cat, attributes: atributos }
}

const capacidad = (key: string, label: string, valueNumber: number, unit = 'Gbps'): CompareDeviceInput['attributes'][number] => ({
  def: { key, labelEs: label, valueType: 'number', unit, compareRule: 'higher-better' },
  display: String(valueNumber),
  valueNumber,
})

const poe = (w: number): CompareDeviceInput['attributes'][number] => ({
  def: { key: 'poe_budget_w', labelEs: 'Presupuesto PoE', valueType: 'number', unit: 'W', compareRule: 'higher-better' },
  display: String(w),
  valueNumber: w,
})

const enumVal = (key: string, label: string, v: string): CompareDeviceInput['attributes'][number] => ({
  def: { key, labelEs: label, valueType: 'enum', compareRule: 'set-compare' },
  display: v,
})

describe('Motor de comparación (F5, §18.2)', () => {
  const a = sw('sw-a', 'Switch A', 'CAT-SWT-L3', [capacidad('switching_capacity_gbps', 'Capacidad', 256), poe(100), enumVal('stackable', 'Apilable', 'no')])
  const b = sw('sw-b', 'Switch B', 'CAT-SWT-L3', [capacidad('switching_capacity_gbps', 'Capacidad', 176), poe(100), enumVal('stackable', 'Apilable', 'no')])
  const c = sw('sw-c', 'Switch C', 'CAT-SWT-L3', [capacidad('switching_capacity_gbps', 'Capacidad', 256), poe(370), enumVal('stackable', 'Apilable', 'sí')])

  it('unifica filas (comunes primero) y marca las específicas', () => {
    const report = compareDevices({ devices: [a, b, c], curatedCompatible: [] })
    expect(report.rows.map((r) => r.key)).toEqual(['switching_capacity_gbps', 'poe_budget_w', 'stackable'])
    expect(report.rows.every((r) => r.common)).toBe(true)
    // capacidad (256/176), poe (100/100/370) y stackable difieren
    expect(report.filasConDiferencias).toBe(3)
  })

  it('aplica reglas higher-better: mejor valor con insignia y limitación explicada', () => {
    const report = compareDevices({ devices: [a, b], curatedCompatible: [] })
    const fila = report.rows.find((r) => r.key === 'switching_capacity_gbps')!
    const best = fila.values.find((v) => v.deviceSlug === 'sw-a')
    expect(best?.isBest).toBe(true)
    const loss = fila.values.find((v) => v.deviceSlug === 'sw-b')
    expect(loss?.isBest).toBe(false)
    expect(loss?.lossReason).toMatch(/176 Gbps frente a 256 Gbps/)
    expect(report.veredicto.some((v) => v.includes('«Capacidad»') && v.includes('sw-a (256)'))).toBe(true)
  })

  it('lower-better premia el mínimo (consumo)', () => {
    const x = sw('x', 'X', 'C', [{ def: { key: 'consumo_w', labelEs: 'Consumo', valueType: 'number', unit: 'W', compareRule: 'lower-better' }, display: '90', valueNumber: 90 }])
    const y = sw('y', 'Y', 'C', [{ def: { key: 'consumo_w', labelEs: 'Consumo', valueType: 'number', unit: 'W', compareRule: 'lower-better' }, display: '120', valueNumber: 120 }])
    const report = compareDevices({ devices: [x, y], curatedCompatible: [] })
    const fila = report.rows[0]!
    expect(fila.values.find((v) => v.deviceSlug === 'x')?.isBest).toBe(true)
    expect(fila.values.find((v) => v.deviceSlug === 'y')?.isBest).toBe(false)
  })

  it('set-compare (enum) no inventa mejor valor pero marca diferencias', () => {
    const report = compareDevices({ devices: [a, c], curatedCompatible: [] })
    const fila = report.rows.find((r) => r.key === 'stackable')!
    expect(fila.values.every((v) => !v.isBest)).toBe(true)
    expect(fila.allEqual).toBe(false)
  })

  it('detecta compatibilidades curadas entre los comparados', () => {
    const report = compareDevices({ devices: [a, b, c], curatedCompatible: [['sw-a', 'sw-c']] })
    expect(report.compatibilidades.some((x) => x.a === 'sw-a' && x.b === 'sw-c' && x.compatible)).toBe(true)
  })

  it('marca comparación transversal entre categorías distintas', () => {
    const puertos = (n: number): CompareDeviceInput['attributes'][number] => ({
      def: { key: 'puertos_totales', labelEs: 'Puertos totales', valueType: 'number', compareRule: 'higher-better' },
      display: String(n),
      valueNumber: n,
    })
    const swConPuertos = sw('sw-a', 'Switch A', 'CAT-SWT-L3', [...a.attributes, puertos(52)])
    const otro = sw('ap-1', 'AP 1', 'CAT-WLS', [enumVal('wifi_max', 'Tasa Wi-Fi', '2400'), puertos(1)])
    const report = compareDevices({ devices: [swConPuertos, otro], curatedCompatible: [] })
    expect(report.transversal).toBe(true)
    // §18.4: solo filas comunes (puertos_totales), el resto se lista como específicas
    expect(report.rows.map((r) => r.key)).toEqual(['puertos_totales'])
    expect(report.especificas.map((e) => e.key)).toEqual(['switching_capacity_gbps', 'poe_budget_w', 'stackable', 'wifi_max'])
    expect(report.veredicto.some((v) => v.includes('Comparación transversal'))).toBe(true)
  })

  it('necesita al menos dos dispositivos', () => {
    const report = compareDevices({ devices: [a], curatedCompatible: [] })
    expect(report.veredicto[0]).toMatch(/al menos dos/)
  })
})

describe('Reglas declarativas de incompatibilidad (NET-HW-041)', () => {
  it('sin interfaz común → conflicto con explicación', () => {
    const res = evaluateCompatibilidad({
      a: 'x', b: 'y', speedsA: [100], speedsB: [2500], mediumsA: [], mediumsB: [], poeBudgetAW: 0, poeBudgetBW: 0, poeRequiredAW: 0, poeRequiredBW: 0,
    })
    expect(res.compatible).toBe(false)
    expect(res.note).toMatch(/Sin interfaz común/)
  })

  it('SMF contra MMF → conflicto de medio óptico', () => {
    const res = evaluateCompatibilidad({
      a: 't1', b: 't2', speedsA: [10000], speedsB: [10000], mediumsA: ['smf-os2'], mediumsB: ['mmf-om3'], poeBudgetAW: 0, poeBudgetBW: 0, poeRequiredAW: 0, poeRequiredBW: 0,
    })
    expect(res.compatible).toBe(false)
    expect(res.note).toMatch(/monomodo/)
  })

  it('PoE requerido > presupuesto → conflicto de alimentación', () => {
    const res = evaluateCompatibilidad({
      a: 'sw', b: 'ap', speedsA: [1000], speedsB: [1000], mediumsA: [], mediumsB: [],
      poeBudgetAW: 100, poeBudgetBW: 0, poeRequiredAW: 0, poeRequiredBW: 150,
    })
    expect(res.compatible).toBe(false)
    expect(res.note).toMatch(/ap necesita 150 W/)
  })

  it('pareja compatible devuelve ok', () => {
    const res = evaluateCompatibilidad({
      a: 's1', b: 's2', speedsA: [1000, 10000], speedsB: [10000], mediumsA: [], mediumsB: [],
      poeBudgetAW: 0, poeBudgetBW: 0, poeRequiredAW: 0, poeRequiredBW: 0,
    })
    expect(res.compatible).toBe(true)
  })
})