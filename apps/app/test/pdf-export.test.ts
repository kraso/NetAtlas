import { describe, expect, it, vi, beforeEach } from 'vitest'
import { construirContenidoPdf } from '../src/ui/exportar-pdf.js'
import type { ComparisonReport } from '@netatlas/domain'

/**
 * F5 — exportación PDF (deuda resuelta, NET-HW-042): el contenido del PDF es
 * puro y testeable sin jsPDF; el render descarga `netatlas-comparacion-….pdf`.
 */

const report: ComparisonReport = {
  devices: [
    { slug: 'cisco-c9300-48p', name: 'Cisco Catalyst 9300-48P' },
    { slug: 'aruba-2930f-48g', name: 'Aruba 2930F 48G PoE+' },
  ],
  rows: [
    {
      key: 'puertos_poe',
      labelEs: 'Puertos con PoE',
      unit: undefined,
      valueType: 'number',
      compareRule: 'higher-better',
      common: true,
      allEqual: false,
      values: [
        { deviceSlug: 'cisco-c9300-48p', display: '0', isBest: false, lossReason: '0 frente a 48' },
        { deviceSlug: 'aruba-2930f-48g', display: '48', isBest: true },
      ],
    },
    {
      key: 'puertos_totales',
      labelEs: 'Puertos totales',
      unit: 'uds',
      valueType: 'number',
      compareRule: 'higher-better',
      common: true,
      allEqual: true,
      values: [
        { deviceSlug: 'cisco-c9300-48p', display: '52', isBest: false },
        { deviceSlug: 'aruba-2930f-48g', display: '52', isBest: false },
      ],
    },
  ],
  especificas: [],
  filasConDiferencias: 1,
  transversal: false,
  atributosEspecificos: 0,
  compatibilidades: [{ a: 'cisco-c9300-48p', b: 'aruba-2930f-48g', compatible: false, note: 'Sin interfaz común: … (0/1000/10000 vs 1000/10000)' }],
  veredicto: [
    'En «Puertos con PoE» el mejor es aruba-2930f-48g: 48 frente a 0.',
    'Incompatibilidad declarada: Sin interfaz común: …',
  ],
}

function textoDe(lineas: readonly { texto: string }[]): string {
  return lineas.map((l) => l.texto).join('\n')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('construirContenidoPdf (F5, NET-HW-042)', () => {
  it('incluye cabecera, dispositivos, atributos con insignias y veredicto', () => {
    const lineas = construirContenidoPdf(report, '2025-03-01')
    const t = textoDe(lineas)

    expect(t).toContain('NetAtlas — Comparación de dispositivos')
    expect(t).toContain('Cisco Catalyst 9300-48P (cisco-c9300-48p)')
    expect(t).toContain('Puertos con PoE')
    expect(t).toContain('cisco-c9300-48p: 0 ▲' === null ? '' : 'cisco-c9300-48p: 0 ▼')
    expect(t).toContain('aruba-2930f-48g: 48 ▲')
    expect(t).toContain('Puertos totales (uds)')
    expect(t).toContain('Veredicto')
    expect(t).toContain('Síntesis determinista por plantilla')
  })

  it('marca los mejores valores y las incompatibilidades declaradas', () => {
    const t = textoDe(construirContenidoPdf(report, '2025-03-01'))
    expect(t).toContain('48 ▲') // mejor valor
    expect(t).toContain('0 ▼') // pérdida frente al mejor
    expect(t).toContain('Incompatibilidad declarada: Sin interfaz común')
    expect(t).toContain('cisco-c9300-48p ↔ aruba-2930f-48g')
  })

  it('usa negrita para atributos/veredicto y sangría en valores (legibilidad PDF)', () => {
    const lineas = construirContenidoPdf(report, '2025-03-01')
    const titulo = lineas.find((l) => l.texto.includes('Puertos con PoE'))
    expect(titulo?.negrita).toBe(true)
    const valor = lineas.find((l) => l.texto.startsWith('  cisco-c9300-48p'))
    expect(valor?.sangria).toBeGreaterThan(0)
    expect(lineas[0]?.tamano).toBeGreaterThanOrEqual(14) // título grande
  })

  it('aviso transversal incluido cuando aplica', () => {
    const transversal = { ...report, transversal: true, atributosEspecificos: 2 }
    const t = textoDe(construirContenidoPdf(transversal, '2025-03-01'))
    expect(t).toContain('Comparación transversal entre categorías')
  })
})