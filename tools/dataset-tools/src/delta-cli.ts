#!/usr/bin/env tsx
/**
 * data:delta — actualización delta de datasets (NET-HW-048, §19.4):
 *  - genera: --from=a.sqlite --to=b.sqlite [--out=delta.json] → diff de devices
 *  - aplica: --apply=delta.json --db=dest [--schema=dir] → transaccional
 * Sin SQL a mano: el flujo completo del criterio F6.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { NodeSqliteDriver, applyMigrations, loadMigrations, applyDelta, diffDatasets } from '@netatlas/data'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SCHEMA = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}

function abrir(path: string): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(path)
  applyMigrations(driver, loadMigrations(arg('schema') ?? DEFAULT_SCHEMA))
  return driver
}

const desde = arg('from')
const hasta = arg('to')
const out = arg('out')
const apply = arg('apply')
const db = arg('db')

// ── Aplicar un delta ─────────────────────────────────────────────────────────
if (apply) {
  if (!db) {
    console.error('Uso: data:delta --apply=delta.json --db=dest.sqlite')
    process.exit(2)
  }
  const cambios = JSON.parse(readFileSync(apply, 'utf8')) as Parameters<typeof applyDelta>[1]
  const driver = abrir(db)
  const res = applyDelta(driver, cambios)
  driver.close()
  console.log(`Delta aplicado — ${apply} → ${db}`)
  console.log(`  aplicados: ${res.aplicados} · rechazados: ${res.rechazados}`)
  for (const r of res.razones) console.log(`  ✗ ${r}`)
  if (res.rechazados > 0) process.exitCode = 1
  process.exit(0)
}

// ── Generar el delta ─────────────────────────────────────────────────────────
if (!desde || !hasta) {
  console.error('Uso: data:delta --from=a.sqlite --to=b.sqlite [--out=delta.json] | --apply=delta.json --db=dest.sqlite')
  process.exit(2)
}
const a = abrir(desde)
const b = abrir(hasta)
const cambios = diffDatasets(a, b)
a.close()
b.close()
const payload = JSON.stringify(cambios, null, 2)
if (out) {
  writeFileSync(out, payload, 'utf8')
  console.log(`Delta generado → ${out}`)
} else {
  console.log(payload)
}
console.log(`  cambios: ${cambios.filter((c) => c.accion !== 'delete').length} altas/actualizaciones + ${cambios.filter((c) => c.accion === 'delete').length} borrados`)