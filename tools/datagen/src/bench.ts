/**
 * Benchmark FTS5 — criterio de salida de la Fase 0:
 * "spike demuestra búsqueda < 50 ms p95 sobre 10k sintéticos" (PLAN MAESTRO §27 F0).
 *
 * Ejecuta N consultas FTS5 variadas contra un dataset sintético de 10.000
 * dispositivos y reporta percentiles (p50/p95/p99) de latencia por consulta.
 * Uso: pnpm bench  (o: pnpm --filter @netatlas/datagen bench)
 */
import { buildSyntheticDataset } from './datagen.js'
import { Fts5SearchIndex } from '@netatlas/search'

const DEVICE_COUNT = 10_000
// Términos representativos presentes en el dataset sintético (fabricantes, modelos,
// categorías y resúmenes) — deterministas para una medición limpia del criterio F0.
const QUERIES = [
  'cisco',
  'switch',
  'aruba 2930f',
  'fortinet',
  'switching',
  'routing',
  'catalyst',
  'mikrotik',
  'CRS328',
  'ubiquiti',
]
const ITERATIONS = 20

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]!
}

async function main(): Promise<void> {
  console.log(`Construyendo dataset sintético: ${DEVICE_COUNT.toLocaleString('es')} dispositivos…`)
  const t0 = performance.now()
  const { driver, rows } = buildSyntheticDataset(DEVICE_COUNT, 42)
  console.log(`Dataset listo en ${(performance.now() - t0).toFixed(0)} ms (${rows.length.toLocaleString('es')} dispositivos, in-memory SQLite WAL)`)

  const search = new Fts5SearchIndex(driver)

  // Calentamiento
  for (const q of QUERIES) await search.query({ rawQuery: q, limit: 20 })

  const latencies: number[] = []
  let totalHits = 0
  let failures = 0

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const q of QUERIES) {
      const t1 = performance.now()
      const res = await search.query({ rawQuery: q, limit: 20 })
      const elapsed = performance.now() - t1
      latencies.push(elapsed)
      totalHits += res.total
      if (res.total === 0) failures++
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b)
  const p50 = percentile(sorted, 50)
  const p95 = percentile(sorted, 95)
  const p99 = percentile(sorted, 99)
  const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length

  console.log(`\n┌────────────────────────────────────────────────┐`)
  console.log(`│  Benchmark FTS5 — ${DEVICE_COUNT.toLocaleString('es')} dispositivos sintéticos`)
  console.log(`│  Consultas: ${QUERIES.length} × ${ITERATIONS} iteraciones = ${latencies.length} mediciones`)
  console.log(`│  Hits totales acumulados: ${totalHits.toLocaleString('es')}`)
  console.log(`├────────────────────────────────────────────────┤`)
  console.log(`│  p50: ${p50.toFixed(2)} ms`)
  console.log(`│  p95: ${p95.toFixed(2)} ms  ${p95 < 50 ? '✅ < 50 ms (criterio F0)' : '❌ ≥ 50 ms (NO cumple)'}`)
  console.log(`│  p99: ${p99.toFixed(2)} ms`)
  console.log(`│  media: ${avg.toFixed(2)} ms`)
  console.log(`│  fallos sin resultados: ${failures}`)
  console.log(`└────────────────────────────────────────────────┘`)

  driver.close()

  if (p95 >= 50 || failures > 0) {
    process.exitCode = 1
  }
}

await main()