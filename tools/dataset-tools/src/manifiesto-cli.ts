#!/usr/bin/env tsx
/**
 * data:manifiesto — verifica el manifiesto del dataset (NET-HW-048, §19.4):
 * integridad SHA-256 del archivo, firma Ed25519 (si se aporta clave pública)
 * y compatibilidad de esquema con la app. Uso:
 *   pnpm data:manifiesto --db=datasets/netatlas-seed.sqlite [--public-key=hex]
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { ManifestRepository, DATASET_SCHEMA_VERSION } from '@netatlas/data'

const here = dirname(fileURLToPath(import.meta.url))
function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}

const dbPath = arg('db') ?? join(here, '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')
const manifestPath = `${dbPath}.manifest.json`

if (!existsSync(dbPath)) {
  console.error(`No existe el dataset: ${dbPath}`)
  process.exit(2)
}
if (!existsSync(manifestPath)) {
  console.error(`No existe el manifiesto: ${manifestPath}`)
  process.exit(3)
}

const repo = new ManifestRepository()
const manifest = repo.leer(manifestPath)
if (!manifest) {
  console.error('Manifiesto ilegible (JSON inválido).')
  process.exit(3)
}

const issues: string[] = []

// 1) Integridad del archivo
if (manifest.sha256) {
  const hash = ManifestRepository.hashArchivo(dbPath)
  const ok = hash === manifest.sha256
  console.log(`sha256: ${hash} ${ok ? '✓ coincide' : '✗ NO coincide'}`)
  if (!ok) issues.push('El hash SHA-256 no coincide: el dataset fue alterado.')
} else {
  console.log('sha256: no declarado')
  issues.push('Manifiesto sin hash SHA-256.')
}

// 2) Firma Ed25519 (clave pública por env o argumento)
const clavePublica = arg('public-key') ?? process.env.NETATLAS_SIGN_PUBLIC_KEY
if (manifest.signature) {
  if (clavePublica) {
    const valido = ManifestRepository.verificar(manifest, clavePublica)
    console.log(`firma: ${valido ? '✓ válida' : '✗ inválida'}`)
    if (!valido) issues.push('La firma Ed25519 no verifica con la clave pública aportada.')
  } else {
    console.log('firma: presente (sin clave pública para verificar; con --public-key o NETATLAS_SIGN_PUBLIC_KEY)')
  }
} else {
  console.log('firma: no presente (dataset sin firmar — builds locales sin clave privada)')
}

// 3) Compatibilidad de esquema con la app
const compat = ManifestRepository.compat(manifest, { minSchemaVersion: 1, maxSchemaVersion: DATASET_SCHEMA_VERSION })
console.log(`compatibilidad: ${compat.status}${compat.status === 'compatible' ? '' : ` — ${compat.reason}`}`)
if (compat.status !== 'compatible') issues.push(compat.reason)

console.log(`versión: ${manifest.version} · publicado: ${manifest.publishedOn} · conteos: ${JSON.stringify(manifest.counts)}`)

if (issues.length > 0) {
  console.error('Manifiesto NO válido:')
  for (const i of issues) console.error(`  - ${i}`)
  process.exit(1)
}
console.log('Manifiesto válido ✓')