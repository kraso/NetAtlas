#!/usr/bin/env node
/**
 * merge-images.mjs — Aplica el staging de fotos al seed y copia los assets.
 *
 * Reglas (defensa en profundidad; el image-finder ya las aplica al construir
 * los objetivos, acá se vuelven a verificar antes de escribir nada):
 *   1. Match por slug EXACTO de dispositivo. Nunca por fabricante ni categoría:
 *      eso fue lo que repartió una sola foto entre 13 fichas distintas.
 *   2. La ficha destino debe existir y tener `model` real.
 *   3. La ficha no debe tener ya una foto.
 *   4. El asset debe existir en .tmp/.
 *
 * No escribe por defecto: hay que pasar --apply.
 *
 * Uso:
 *   node tools/image-finder/merge-images.mjs            # dry run (default)
 *   node tools/image-finder/merge-images.mjs --apply
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const SEED_DIR = join(ROOT, 'datasets', 'seed')
const STAGING_DIR = __dirname
const TMP_DIR = join(STAGING_DIR, '.tmp')
const PUBLIC_IMG = join(ROOT, 'apps', 'app', 'public', 'assets', 'img')

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function loadJsonIfExists(path, fallback) {
  return existsSync(path) ? loadJson(path) : fallback
}

function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function main() {
  const apply = process.argv.includes('--apply')
  const stagingPath = join(STAGING_DIR, 'staging-images.json')

  if (!existsSync(stagingPath)) {
    console.error('No hay staging-images.json. Corré primero las fases 1-3 del image-finder.')
    process.exit(1)
  }

  console.log('╔══════════════════════════════════════════╗')
  console.log('║   NetAtlas Image Merger v2.0             ║')
  console.log('╚══════════════════════════════════════════╝')

  const staging = loadJson(stagingPath)
  const images = staging.images ?? []

  const seedPath = join(SEED_DIR, 'devices.json')
  const genPath = join(SEED_DIR, 'devices-generated.json')
  const devSeed = loadJson(seedPath)
  const devGen = loadJsonIfExists(genPath, [])
  const sources = loadJson(join(SEED_DIR, 'sources.json'))
  const sourceSlugs = new Set(sources.map((s) => s.slug))

  console.log(`\n${apply ? 'Aplicando' : 'Simulando'} ${images.length} entrada(s) de staging...\n`)

  let applied = 0
  const skipped = []
  const sourcesAdded = []
  const copied = []

  for (const entry of images) {
    const slug = entry.deviceSlug
    const dev = devSeed.find((d) => d.slug === slug) ?? devGen.find((d) => d.slug === slug)

    if (!dev) {
      skipped.push([slug, 'no existe una ficha con ese slug'])
      continue
    }
    if (!String(dev.model ?? '').trim()) {
      skipped.push([slug, 'la ficha no tiene "model" real: no admite foto'])
      continue
    }
    if ((dev.images ?? []).length > 0) {
      skipped.push([slug, 'la ficha ya tiene foto'])
      continue
    }
    const tmpFile = join(TMP_DIR, entry.tmpPath ?? basename(entry.image.localPath))
    if (!existsSync(tmpFile)) {
      skipped.push([slug, `falta el asset en .tmp/ (${entry.tmpPath ?? basename(entry.image.localPath)})`])
      continue
    }

    dev.images = [entry.image]
    applied++
    console.log(`  ✅ ${slug} → ${entry.image.localPath}`)
    console.log(`       caption: ${entry.image.caption}`)

    if (!sourceSlugs.has(entry.sourceEntry.slug)) {
      sources.push(entry.sourceEntry)
      sourceSlugs.add(entry.sourceEntry.slug)
      sourcesAdded.push(entry.sourceEntry.slug)
    }

    if (apply) copyFileSync(tmpFile, join(PUBLIC_IMG, basename(entry.image.localPath)))
    copied.push([tmpFile, join(PUBLIC_IMG, basename(entry.image.localPath))])
  }

  for (const [slug, reason] of skipped) {
    console.log(`  ⏭️  ${slug}: ${reason}`)
  }

  console.log('')
  if (apply) {
    saveJson(seedPath, devSeed)
    if (devGen.length > 0) saveJson(genPath, devGen)
    saveJson(join(SEED_DIR, 'sources.json'), sources)
    console.log(`📄 devices.json / devices-generated.json actualizados · ${applied} ficha(s)`)
    console.log(`📄 assets copiados a public/assets/img: ${copied.length}`)
    console.log(`📄 sources.json: ${sourcesAdded.length} fuente(s) añadida(s)`)
    console.log('\n   Siguiente paso: dataset:build → data:lint → pnpm test → revisar la ficha en la app')
  } else {
    console.log(`Simulación: se aplicarían ${applied} ficha(s), se copiarían ${copied.length} asset(s).`)
    console.log('Para escribir de verdad: --apply')
  }
}

main()
