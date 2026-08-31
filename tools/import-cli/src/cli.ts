#!/usr/bin/env tsx
/**
 * import-cli — importación por línea de comandos (NET-HW-043 como herramienta).
 *
 * Uso:
 *   pnpm import --csv=<archivo> --db=<netatlas.sqlite> [--schema=<dir migraciones>]
 *   pnpm import --json=<archivo> --db=<netatlas.sqlite>
 *
 * Aplica el pipeline del dominio (parse → normaliza → valida → dedup →
 * reconcilia → persiste) sobre el driver SQLite real y emite el informe de lote
 * (altas/actualizaciones/conflictos/rechazos con razón) — criterio 28.1.6#5.
 */
import { readFileSync } from 'node:fs'
import { NodeSqliteDriver, loadMigrations, applyMigrations } from '@netatlas/data'
import { parseCsv, parseJson, runImport } from '@netatlas/importers'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SCHEMA = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}

const csvPath = arg('csv')
const jsonPath = arg('json')
const dbPath = arg('db') ?? ':memory:'
const schemaDir = arg('schema') ?? DEFAULT_SCHEMA

if (!csvPath && !jsonPath) {
  console.error('Uso: import-cli --csv=<file> | --json=<file> [--db=path] [--schema=dir]')
  process.exit(2)
}

try {
  const source = csvPath ?? jsonPath!
  const text = readFileSync(source, 'utf8')
  const parsed = csvPath ? parseCsv(text, source) : parseJson(text, source)
  if (parsed.errors.length > 0) {
    console.error(`Error de parseo (${parsed.errors.length}):`)
    for (const e of parsed.errors.slice(0, 10)) console.error(`  [registro ${e.record}] ${e.message}`)
    process.exit(3)
  }

  const driver = new NodeSqliteDriver(dbPath)
  applyMigrations(driver, loadMigrations(schemaDir))
  const report = runImport(parsed.records, { driver })
  driver.close()

  console.log(`Informe de lote — ${source}`)
  console.log(`  total:            ${report.total}`)
  console.log(`  altas:            ${report.altas}`)
  console.log(`  actualizaciones:  ${report.actualizaciones}`)
  console.log(`  conflictos:       ${report.conflictos}`)
  console.log(`  rechazos:         ${report.rechazos}`)
  if (report.validaciones.length > 0) {
    console.log('  razones de rechazo:')
    for (const v of report.validaciones.slice(0, 20)) console.log(`    [${v.rule}] ${v.message}`)
  }
  if (report.rechazos > 0) process.exitCode = 1
} catch (err) {
  console.error(`Importación fallida: ${(err as Error).message}`)
  process.exit(1)
}