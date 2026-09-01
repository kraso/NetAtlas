#!/usr/bin/env tsx
/**
 * import-cli — importación por línea de comandos (NET-HW-043/045/046, criterio F6).
 *
 * Uso:
 *   pnpm import --csv=<file>|--json=<file>|--yaml=<file>|--xml=<file> --db=<netatlas.sqlite>
 *             [--schema=<dir migraciones>] [--curator=<autor>] [--publish]
 *
 * Aplica el pipeline completo (parse → normaliza → valida → dedup → reconcilia →
 * persiste) sobre el driver SQLite real. Los candidatos a revisión (dedup score
 * 0.7–0.98) van a la cola de reconciliación con diff lado a lado (NET-HW-045/049);
 * el informe de lote refleja altas/actualizaciones/conflictos/rechazos.
 */
import { readFileSync } from 'node:fs'
import { NodeSqliteDriver, loadMigrations, applyMigrations, SqliteReconciliationRepository } from '@netatlas/data'
import { parseCsv, parseJson, parseYaml, parseXml, runImport } from '@netatlas/importers'
import type { ImportDeps, RunImportOpciones } from '@netatlas/importers'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SCHEMA = join(here, '..', '..', '..', 'packages', 'data', 'migrations')

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}

export function ejecutarImportacion(args: {
  file: string
  formato: 'csv' | 'json' | 'yaml' | 'xml'
  db?: string
  schema?: string
  curator?: string
}): { ok: boolean } {
  const source = args.file
  const text = readFileSync(source, 'utf8')
  const parsed =
    args.formato === 'csv'
      ? parseCsv(text, source)
      : args.formato === 'json'
        ? parseJson(text, source)
        : args.formato === 'yaml'
          ? parseYaml(text, source)
          : parseXml(text, source)
  if (parsed.errors.length > 0) {
    for (const e of parsed.errors.slice(0, 10)) console.error(`  [registro ${e.record}] ${e.message}`)
    throw new Error(`Error de parseo (${parsed.errors.length}).`)
  }

  const driver = new NodeSqliteDriver(args.db ?? ':memory:')
  applyMigrations(driver, loadMigrations(args.schema ?? DEFAULT_SCHEMA))
  const deps: ImportDeps = { driver }
  const cola = new SqliteReconciliationRepository(driver)
  const opciones: RunImportOpciones = {
    onConflicto: (c) => {
      void cola.crear({ entradaSlug: c.entradaSlug, existenteSlug: c.existenteSlug, score: c.score, diff: c.diff })
    },
  }
  const report = runImport(parsed.records, deps, opciones)
  driver.close()

  console.log(`Informe de lote — ${source} (${args.formato})`)
  console.log(`  total:            ${report.total}`)
  console.log(`  altas:            ${report.altas}`)
  console.log(`  actualizaciones:  ${report.actualizaciones} (incluye fusiones automáticas ≥0.98)`)
  console.log(`  conflictos:       ${report.conflictos}`)
  console.log(`  sin cambios:      ${report.sinCambio}`)
  console.log(`  rechazos:         ${report.rechazos}`)
  for (const c of report.conflictosDetalle.slice(0, 20)) {
    console.log(`  → candidato a revisión: ${c.entradaSlug} ↔ ${c.existenteSlug} (score ${c.score.toFixed(3)})`)
    for (const d of c.diff) console.log(`      ${d.campo}: «${d.entrante}» → «${d.existente}»`)
  }
  if (report.validaciones.length > 0) {
    console.log('  razones de rechazo:')
    for (const v of report.validaciones.slice(0, 20)) console.log(`    [${v.rule}] ${v.message}`)
  }
  return { ok: report.rechazos === 0 }
}

if (process.argv[1] && process.argv[1].endsWith('cli.ts')) {
  const file = arg('csv') ?? arg('json') ?? arg('yaml') ?? arg('xml')
  const formato = (arg('csv') ? 'csv' : arg('json') ? 'json' : arg('yaml') ? 'yaml' : arg('xml') ? 'xml' : undefined) as 'csv' | 'json' | 'yaml' | 'xml' | undefined
  if (!file || !formato) {
    console.error('Uso: import-cli --csv=<file> | --json=<file> | --yaml=<file> | --xml=<file> [--db=path] [--schema=dir] [--curator=nombre]')
    process.exit(2)
  }
  try {
    const res = ejecutarImportacion({ file, formato, db: arg('db'), schema: arg('schema'), curator: arg('curator') })
    if (!res.ok) process.exitCode = 1
  } catch (err) {
    console.error(`Importación fallida: ${(err as Error).message}`)
    process.exit(1)
  }
}