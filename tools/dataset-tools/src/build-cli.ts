#!/usr/bin/env tsx
// dataset:build — seed → SQLite. Uso: pnpm dataset:build [dirSeed] [outPath]
import { buildSeedDatabase } from './build.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = process.argv[2] ?? join(here, '..', '..', '..', 'datasets', 'seed')
const outPath = process.argv[3] ?? join(here, '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')

const { deviceCount, relationshipCount, assertionCount, catalogCounts, schemaVersion } = buildSeedDatabase(seedDir, outPath)
console.log(`dataset:build OK → ${outPath}`)
console.log(`  dispositivos: ${deviceCount}`)
console.log(`  catálogos:    ${catalogCounts.protocols} protocolos · ${catalogCounts.standards} estándares · ${catalogCounts.media} medios · ${catalogCounts.manufacturers} fabricantes · ${catalogCounts.categories} categorías`)
console.log(`  relaciones:   ${relationshipCount}`)
console.log(`  assertions:   ${assertionCount}`)
console.log(`  esquema:      v${schemaVersion}`)