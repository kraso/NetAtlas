import { describe, expect, it } from 'vitest'
import { resumenVeredicto, etiquetaVeredicto, etiquetaDeReporte, verificarEtiqueta } from '../src/index.js'
import type { ComparisonReport } from '../src/index.js'

const reporte: ComparisonReport = {
  devices: [
    { slug: 'cisco-c9300-48p', name: 'Cisco Catalyst 9300-48P', categoryCode: 'CAT-SWT-L3', categoryName: 'Switches multilayer' },
    { slug: 'aruba-2930f-48g', name: 'Aruba 2930F 48G PoE+', categoryCode: 'CAT-SWT-L2', categoryName: 'Switches capa 2' },
  ],
  transversal: true,
  rows: [],
  especificas: [{ key: 'poe', labelEs: 'Presupuesto PoE' }],
  compatibilidades: [],
  veredicto: ['En «Puertos con PoE», destaca aruba-2930f-48g (48).', 'Comparación transversal entre categorías.'],
  filasConDiferencias: 1,
  atributosEspecificos: 1,
}

describe('Enlace compartible con veredicto (F5 refinamiento)', () => {
  it('resumenVeredicto es estable y distingue reportes diferentes', () => {
    const r1 = resumenVeredicto(reporte)
    const igual = resumenVeredicto(reporte)
    expect(r1).toBe(igual)
    expect(r1).toContain('transversal=true')
    expect(r1).toContain('En «Puertos con PoE»')
    const cambiado = resumenVeredicto({ ...reporte, filasConDiferencias: 0 })
    expect(cambiado).not.toBe(r1)
  })

  it('etiquetaVeredicto es un hash FNV-1a de 8 hex determinista', () => {
    const h1 = etiquetaVeredicto(resumenVeredicto(reporte))
    const h2 = etiquetaVeredicto(resumenVeredicto(reporte))
    expect(h1).toMatch(/^[0-9a-f]{8}$/)
    expect(h1).toBe(h2)
    const otro = etiquetaVeredicto(resumenVeredicto({ ...reporte, veredicto: ['otro'] }))
    expect(otro).not.toBe(h1)
  })

  it('etiquetaDeReporte genera y verificarEtiqueta valida', () => {
    const { hash } = etiquetaDeReporte(reporte)
    expect(verificarEtiqueta(reporte, hash)).toBe(true)
    expect(verificarEtiqueta(reporte, null)).toBe(false)
    expect(verificarEtiqueta(reporte, '00000000')).toBe(false)
    // Un reporte con datos distintos no valida la misma etiqueta.
    const cambiado = { ...reporte, filasConDiferencias: 0 }
    expect(verificarEtiqueta(cambiado, hash)).toBe(false)
  })
})