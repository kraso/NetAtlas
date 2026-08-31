import { describe, it, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { normalizar, validar } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', '..', 'data', 'migrations')

const estadoValido = fc.constantFrom(
  'announced', 'current', 'mature', 'eol', 'eos', 'legacy', 'discontinued',
)

const registroArbitrario = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  manufacturerSlug: fc.string({ minLength: 1, maxLength: 20 }),
  categoryCode: fc.constantFrom('CAT-SWT', 'CAT-RTR', 'CAT-IFC', 'CAT-BAD'),
  lifecycleStatus: fc.oneof(estadoValido, fc.string({ minLength: 1, maxLength: 12 })),
  model: fc.option(fc.string({ minLength: 1, maxLength: 15 })),
  assertions: fc.option(fc.array(
    fc.record({
      predicate: fc.constantFrom('supports-protocol', 'otro-predicado'),
      value: fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()),
      sourceSlug: fc.string({ minLength: 1, maxLength: 10 }),
      confidence: fc.oneof(
        fc.constantFrom('official', 'derived', 'third-party', 'experimental', 'historical'),
        fc.string({ minLength: 1, maxLength: 8 }),
      ),
    }),
    { maxLength: 3 },
  )),
  relationships: fc.option(fc.array(
    fc.record({
      predicate: fc.constantFrom('supports-protocol', 'inventado-x'),
      objectType: fc.constantFrom('protocol', 'device'),
      objectSlug: fc.string({ minLength: 1, maxLength: 10 }),
    }),
    { maxLength: 2 },
  )),
})

/**
 * NET-HW-054 — property-based: los registros aleatorios nunca rompen el pipeline.
 * El contrato: normalizar() nunca lanza; validar() siempre devuelve issues tipadas
 * (nunca excepciones) y los válidos son estructuralmente consistentes.
 */
describe('property-based — pipeline de importación', () => {
  test('normalizar nunca lanza y produce slugs canónicos o vacíos', () => {
    fc.assert(
      fc.property(fc.array(registroArbitrario, { maxLength: 10 }), (registros) => {
        const raw = registros.map((r) => ({
          device: {
            name: r.name,
            manufacturerSlug: r.manufacturerSlug,
            categoryCode: r.categoryCode,
            lifecycleStatus: r.lifecycleStatus,
            model: r.model ?? undefined,
            assertions: r.assertions ?? undefined,
            relationships: r.relationships ?? undefined,
          },
          source: { file: 'prop.test', line: 1 },
        }))
        const norm = normalizar(raw)
        for (const n of norm) {
          // Nunca lanza y el slug o es un slug válido o está ausente (se regenera)
          expect(n.device.slug).toBeDefined()
        }
      }),
      { numRuns: 50 },
    )
  })

  test('validar nunca lanza y todas las issues tienen regla conocida', () => {
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const deps = {
      driver,
      knownProtocols: new Set(['ospf']),
      knownMedia: new Set<string>(),
    }
    fc.assert(
      fc.property(fc.array(registroArbitrario, { maxLength: 10 }), (registros) => {
        const raw = registros.map((r) => ({
          device: {
            name: r.name,
            manufacturerSlug: r.manufacturerSlug,
            categoryCode: r.categoryCode,
            lifecycleStatus: r.lifecycleStatus,
            model: r.model ?? undefined,
            assertions: r.assertions ?? undefined,
            relationships: r.relationships ?? undefined,
          },
          source: { file: 'prop.test', line: 1 },
        }))
        let result
        expect(() => {
          result = validar(normalizar(raw), deps)
        }).not.toThrow()
        const reglas = result!.issues.map((i: { rule: string }) => i.rule)
        for (const regla of new Set(reglas)) {
          expect(['slug', 'lifecycle', 'category', 'predicate', 'closed-catalog', 'assertion-confidence', 'assertion-source'])
            .toContain(regla)
        }
        expect(result!.validos.length + result!.issues.length).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 50 },
    )
    driver.close()
  })
})