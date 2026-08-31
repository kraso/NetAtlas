#!/usr/bin/env tsx
// data:lint — valida invariantes del dataset seed. Uso: pnpm data:lint [dirSeed]
import { lintSeed, loadSeed } from './lint.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = process.argv[2] ?? join(here, '..', '..', '..', 'datasets', 'seed')

const seed = loadSeed(seedDir)
const report = lintSeed(seed)
for (const issue of report.issues) {
  const tag = issue.severity === 'error' ? 'ERROR' : 'WARN '
  console.log(`[${tag}] [${issue.rule}] ${issue.message}`)
}
console.log(
  `\ndata:lint: ${report.issues.length} avisos (${report.issues.filter((i) => i.severity === 'error').length} errores) sobre ${seed.devices.length} dispositivos.`,
)
if (!report.ok) process.exitCode = 1