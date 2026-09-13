#!/usr/bin/env node
/**
 * merge-images.mjs — Aplica las imágenes descubiertas a los archivos seed.
 *
 * Lee staging-images.json y:
 *   1. Añade images[] a devices-generated.json (para fabricantes)
 *   2. Añade images[] a devices.json (para curados)
 *   3. Añade source entries a sources.json (deduplicadas)
 *
 * Uso:
 *   node tools/image-finder/merge-images.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const SEED_DIR = join(ROOT, 'datasets', 'seed')
const STAGING_DIR = __dirname

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const staging = loadJson(join(STAGING_DIR, 'staging-images.json'))

  console.log('╔══════════════════════════════════════════╗')
  console.log('║   NetAtlas Image Merger v1.0             ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`\nMergeando ${staging.totalEntries} entradas...`)

  // ── 1. Merge images into devices-generated.json ──────────────────────
  //    The image finder uses manufacturer slugs (e.g. "huawei") but devices
  //    have slugs like "huawei-cat-swt-407". Match by manufacturerSlug + category.
  const generated = loadJson(join(SEED_DIR, 'devices-generated.json'))
  let generatedUpdated = 0
  for (const entry of staging.images) {
    if (entry.metadata.searchType !== 'manufacturer') continue

    // Find devices matching this manufacturer AND category (if category specified)
    const matches = generated.filter((d) => {
      if (d.manufacturerSlug !== entry.manufacturerSlug) return false
      if (entry.metadata.categoryCode && d.categoryCode !== entry.metadata.categoryCode) return false
      return true
    })

    if (matches.length === 0) {
      // Fallback: assign to ALL devices of this manufacturer
      const allByMfr = generated.filter((d) => d.manufacturerSlug === entry.manufacturerSlug)
      if (allByMfr.length === 0) {
        console.log(`  ⚠️  ${entry.manufacturerSlug}: no devices found in devices-generated.json`)
        continue
      }
      for (const dev of allByMfr) {
        if (!dev.images) dev.images = []
        // Only add if this category doesn't already have an image
        if (dev.images.length === 0) {
          dev.images.push(entry.image)
        }
      }
      generatedUpdated += allByMfr.length
      console.log(`  ✅  ${entry.manufacturerSlug}: → ${allByMfr.length} devices (all categories)`)
    } else {
      for (const dev of matches) {
        if (!dev.images) dev.images = []
        if (dev.images.length === 0) {
          dev.images.push(entry.image)
        }
      }
      generatedUpdated += matches.length
      console.log(`  ✅  ${entry.manufacturerSlug}+${entry.metadata.categoryCode}: → ${matches.length} devices`)
    }
  }

  if (!dryRun) {
    saveJson(join(SEED_DIR, 'devices-generated.json'), generated)
  }
  console.log(`\n📄 devices-generated.json: ${generatedUpdated} dispositivos actualizados${dryRun ? ' (dry run)' : ''}`)

  // ── 2. Merge images into devices.json ────────────────────────────────
  //    Curated devices use the device slug directly (e.g. "aruba-ap-515")
  const seed = loadJson(join(SEED_DIR, 'devices.json'))
  let seedUpdated = 0
  for (const entry of staging.images) {
    if (entry.metadata.searchType !== 'curated') continue
    const dev = seed.find((d) => d.slug === entry.deviceSlug)
    if (!dev) {
      console.log(`  ⚠️  ${entry.deviceSlug}: no encontrado en devices.json`)
      continue
    }
    if (dev.images && dev.images.length > 0) {
      console.log(`  ⏭️  ${entry.deviceSlug}: ya tiene imagen, saltando`)
      continue
    }
    dev.images = [entry.image]
    seedUpdated++
  }

  if (!dryRun) {
    saveJson(join(SEED_DIR, 'devices.json'), seed)
  }
  console.log(`📄 devices.json: ${seedUpdated} dispositivos actualizados${dryRun ? ' (dry run)' : ''}`)

  // ── 3. Merge sources into sources.json ───────────────────────────────
  const sources = loadJson(join(SEED_DIR, 'sources.json'))
  const existingSlugs = new Set(sources.map((s) => s.slug))
  let sourcesAdded = 0
  for (const src of staging.sources) {
    if (existingSlugs.has(src.slug)) {
      console.log(`  ⏭️  ${src.slug}: ya existe en sources.json`)
      continue
    }
    sources.push(src)
    existingSlugs.add(src.slug)
    sourcesAdded++
  }

  if (!dryRun) {
    saveJson(join(SEED_DIR, 'sources.json'), sources)
  }
  console.log(`📄 sources.json: ${sourcesAdded} fuentes añadidas${dryRun ? ' (dry run)' : ''}`)

  console.log(`\n✅ Merge ${dryRun ? '(dry run) ' : ''}completado.`)
  if (!dryRun) {
    console.log('   Siguiente paso: dataset:build → data:lint → pnpm test → commit')
  }
}

main()
