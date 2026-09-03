import { describe, it, expect } from 'vitest'
import { importarLote } from '../src/casos/importar-lote.js'
import type { RawRecord, BatchReport, ImportDeps } from '@netatlas/importers'
import type { SqliteDriver } from '@netatlas/data'

function mockDriver(): SqliteDriver {
  return {
    prepare: (_sql: string) => ({
      all: (..._params: unknown[]): unknown[] => [],
      get: (..._params: unknown[]): unknown => ({ id: 1 }),
      run: (..._params: unknown[]): { changes: number } => ({ changes: 1 }),
    }),
    exec: (_sql: string) => undefined,
    close: () => undefined,
    transaction: <T>(fn: () => T): T => fn(),
  } as SqliteDriver
}

const makeRecord = (slug: string): RawRecord => ({
  device: {
    slug,
    name: `Device ${slug}`,
    manufacturerSlug: 'cisco',
    categoryCode: 'CAT-SWT-L2',
    lifecycleStatus: 'current',
    model: slug.split('-')[1]!,
    ports: [{ label: 'Gi1/0/1', interfaceCode: 'rj45-1g', quantity: 24, speedsMbps: [1000] }],
  },
  source: { file: 'test.csv', line: 1 },
})

describe('importarLote', () => {
  it('delega al pipeline y devuelve un BatchReport con conteos', async () => {
    const { report } = await importarLote({
      rawRecords: [makeRecord('sw-a'), makeRecord('sw-b')],
      deps: { driver: mockDriver(), knownProtocols: new Set(), knownStandards: new Set(), knownMedia: new Set() },
    })
    expect(report.total).toBe(2)
    expect(report.rechazos).toBe(0)
  })

  it('inicializa todos los contadores del reporte', async () => {
    const { report }: { report: BatchReport } = await importarLote({
      rawRecords: [],
      deps: { driver: mockDriver() },
    })
    expect(report.total).toBe(0)
    expect(report.altas).toBe(0)
    expect(report.actualizaciones).toBe(0)
    expect(report.conflictos).toBe(0)
    expect(report.sinCambio).toBe(0)
  })
})
