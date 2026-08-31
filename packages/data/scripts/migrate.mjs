#!/usr/bin/env node
// CLI: node scripts/migrate.mjs [--path=./netatlas.sqlite]
// Aplica las migraciones pendientes (migrations/NNNN_*.sql) a un SQLite.
// Autónomo: no depende de la compilación TS; usa node:sqlite nativo.
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'migrations')
const arg = process.argv.find((a) => a.startsWith('--path='))
const path = arg ? arg.slice('--path='.length) : ':memory:'

const db = new DatabaseSync(path)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA synchronous = NORMAL')

db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT NOT NULL
)`)

const current = Number(db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM schema_version').get().v)
const files = readdirSync(migrationsDir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
const applied = []
const skipped = []

const insertVersion = db.prepare(
  'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
)

for (const file of files) {
  const version = Number(file.slice(0, 4))
  if (version <= current) {
    skipped.push(version)
    continue
  }
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  db.exec('BEGIN')
  try {
    db.exec(sql)
    insertVersion.run(version, new Date().toISOString(), `Migración ${version} ${file}`)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw new Error(`Migración ${file} falló: ${err.message}`)
  }
  applied.push(version)
}

const finalVersion = Number(db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM schema_version').get().v)
console.log(`Migraciones aplicadas: ${applied.join(', ') || '(ninguna)'}`)
console.log(`Ya presentes: ${skipped.join(', ') || '(ninguna)'}`)
console.log(`Versión final del esquema: ${finalVersion}`)

if (path !== ':memory:') db.close()