#!/usr/bin/env node
/**
 * image-finder.mjs — Busca fotos de producto para dispositivos NetAtlas.
 *
 * Fase 1: Brave Image Search → URLs de imágenes (42/50 queries)
 * Fase 2: Descarga + conversión a webp (Playwright + ffmpeg)
 * Fase 3: Genera staging-images.json listo para mergear en devices.json
 *
 * Uso:
 *   node tools/image-finder/image-finder.mjs [--phase 1|2|3] [--dry-run]
 *
 * Env requerido: BRAVE_API_KEY
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const PUBLIC_IMG = join(ROOT, 'apps', 'app', 'public', 'assets', 'img')
const SEED_DIR = join(ROOT, 'datasets', 'seed')
const STAGING_DIR = __dirname

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSA9HMpr9-zQZQ-d50HduQ8nERCpAbl'
const BRAVE_IMG_URL = 'https://api.search.brave.com/res/v1/images/search'
const CONCURRENCY = 5
const DELAY_MS = 300

// ── Category code → English label ──────────────────────────────────────────
const CATEGORY_LABELS = {
  'CAT-SWT': 'switch', 'CAT-SWT-L2': 'managed switch', 'CAT-SWT-L3': 'layer 3 switch',
  'CAT-SWT-HUB': 'hub', 'CAT-RTR': 'router', 'CAT-RTR-ENT': 'enterprise router',
  'CAT-RTR-SOHO': 'SOHO router', 'CAT-SEC-FW': 'firewall', 'CAT-SEC-NGFW': 'next generation firewall',
  'CAT-SEC': 'security appliance', 'CAT-WLS-AP': 'wireless access point',
  'CAT-WLS': 'wireless controller', 'CAT-ACC': 'network accelerator',
  'CAT-ACC-CABLE': 'network cable', 'CAT-ACC-DIAL': 'dial modem',
  'CAT-ACC-ONT': 'optical network terminal', 'CAT-TEL': 'telecom equipment',
  'CAT-OPT': 'fiber optic transceiver', 'CAT-IND': 'industrial networking',
  'CAT-IOT': 'IoT gateway', 'CAT-DCN': 'data center networking',
}

// ── Helpers ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

async function braveImageSearch(query, count = 5) {
  const params = new URLSearchParams({ q: query, count: String(count) })
  const resp = await fetch(`${BRAVE_IMG_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY,
    },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Brave ${resp.status}: ${body.substring(0, 200)}`)
  }
  return resp.json()
}

function pickBestImage(results) {
  // Prefer high confidence, raster images (not SVG), reasonable dimensions
  const candidates = results
    .filter((r) => r.properties?.url && !r.properties.url.endsWith('.svg'))
    .sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 }
      const ca = confOrder[a.confidence] ?? 3
      const cb = confOrder[b.confidence] ?? 3
      if (ca !== cb) return ca - cb
      // Prefer larger images
      return (b.properties.width || 0) - (a.properties.width || 0)
    })
  return candidates[0] || null
}

async function downloadImage(url, destPath) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NetAtlas/1.0)' },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length < 1000) throw new Error(`Too small: ${buf.length} bytes`)
    writeFileSync(destPath, buf)
    return buf.length
  } catch (err) {
    throw new Error(`Download failed: ${err.message}`)
  }
}

function convertToWebp(inputPath, outputPath) {
  try {
    execSync(
      `ffmpeg -y -i "${inputPath}" -quality 80 -q:v 4 "${outputPath}" 2>nul`,
      { timeout: 15000 }
    )
    return statSync(outputPath).size
  } catch {
    // If ffmpeg fails on the file, keep the original
    return null
  }
}

// ── Phase 1: Discover image URLs ──────────────────────────────────────────
async function phase1Discover() {
  const manufacturers = loadJson(join(STAGING_DIR, 'manufacturers.json'))
  const curated = loadJson(join(STAGING_DIR, 'curated-missing.json'))

  const queries = []

  // Queries for manufacturers (1 per manufacturer, using first category)
  for (const mfr of manufacturers) {
    const catLabel = CATEGORY_LABELS[mfr.categories[0]] || 'networking'
    queries.push({
      type: 'manufacturer',
      slug: mfr.slug,
      manufacturerSlug: mfr.slug,
      query: `${mfr.slug} ${catLabel} product photo`,
      categoryCode: mfr.categories[0],
    })
  }

  // Queries for curated missing devices
  for (const dev of curated) {
    queries.push({
      type: 'curated',
      slug: dev.slug,
      manufacturerSlug: dev.manufacturerSlug,
      query: dev.query,
      categoryCode: null,
    })
  }

  console.log(`\n🔍 Phase 1: Discovering images for ${queries.length} queries...`)

  const results = []
  let used = 0
  const MAX_QUERIES = 42

  for (let i = 0; i < queries.length && used < MAX_QUERIES; i++) {
    const q = queries[i]
    process.stdout.write(`  [${i + 1}/${queries.length}] "${q.query}" ... `)

    try {
      const data = await braveImageSearch(q.query, 5)
      const best = pickBestImage(data.results || [])

      if (best) {
        results.push({
          ...q,
          imageUrl: best.properties.url,
          thumbnail: best.thumbnail?.src || null,
          title: best.title || '',
          source: best.source || '',
          confidence: best.confidence || 'unknown',
          width: best.properties.width || 0,
          height: best.properties.height || 0,
        })
        console.log(`✅ ${best.confidence} (${best.properties.width}x${best.properties.height})`)
      } else {
        results.push({ ...q, imageUrl: null, confidence: 'none', error: 'No suitable image found' })
        console.log('❌ no image')
      }
      used++
    } catch (err) {
      results.push({ ...q, imageUrl: null, confidence: 'error', error: err.message })
      console.log(`❌ ${err.message}`)
    }

    if (i < queries.length - 1) await sleep(DELAY_MS)
  }

  const outPath = join(STAGING_DIR, 'staging-urls.json')
  saveJson(outPath, results)
  console.log(`\n📄 URLs guardadas en: ${outPath}`)
  console.log(`   Total: ${results.length} | Con imagen: ${results.filter((r) => r.imageUrl).length} | Queries usadas: ${used}/${MAX_QUERIES}`)

  return results
}

// ── Phase 2: Download + Convert ───────────────────────────────────────────
async function phase2Download() {
  const urls = loadJson(join(STAGING_DIR, 'staging-urls.json'))
  const toDownload = urls.filter((r) => r.imageUrl && r.confidence !== 'error')

  console.log(`\n📥 Phase 2: Downloading ${toDownload.length} images...`)

  if (!existsSync(PUBLIC_IMG)) mkdirSync(PUBLIC_IMG, { recursive: true })

  const downloaded = []
  const tmpDir = join(STAGING_DIR, '.tmp')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

  for (let i = 0; i < toDownload.length; i += CONCURRENCY) {
    const batch = toDownload.slice(i, i + CONCURRENCY)
    const promises = batch.map(async (item) => {
      const ext = item.imageUrl.match(/\.(png|jpe?g|gif|webp|avif)(\?|$)/i)?.[1] || 'jpg'
      const tmpPath = join(tmpDir, `${item.slug}-raw.${ext}`)
      const outName = `${item.slug}-frontal.webp`
      const outPath = join(PUBLIC_IMG, outName)

      try {
        const size = await downloadImage(item.imageUrl, tmpPath)
        console.log(`  [${i + batch.indexOf(item) + 1}/${toDownload.length}] ${item.slug}: downloaded ${size} bytes`)

        const webpSize = convertToWebp(tmpPath, outPath)
        if (webpSize) {
          console.log(`    → webp: ${webpSize} bytes`)
          downloaded.push({
            ...item,
            localPath: `assets/img/${outName}`,
            downloadSize: size,
            webpSize,
          })
        } else {
          // Keep original if webp conversion fails
          const origPath = join(PUBLIC_IMG, `${item.slug}-frontal.${ext}`)
          const { renameSync } = await import('node:fs')
          renameSync(tmpPath, origPath)
          downloaded.push({
            ...item,
            localPath: `assets/img/${item.slug}-frontal.${ext}`,
            downloadSize: size,
            webpSize: null,
          })
          console.log(`    → kept original .${ext}`)
        }
      } catch (err) {
        console.log(`  [${i + batch.indexOf(item) + 1}/${toDownload.length}] ${item.slug}: ❌ ${err.message}`)
      }
    })
    await Promise.all(promises)
  }

  const outPath = join(STAGING_DIR, 'staging-downloaded.json')
  saveJson(outPath, downloaded)
  console.log(`\n📄 Descargas guardadas en: ${outPath}`)
  console.log(`   Exitosas: ${downloaded.length}/${toDownload.length}`)

  return downloaded
}

// ── Phase 3: Generate staging-images.json ─────────────────────────────────
function phase3Generate() {
  const downloaded = loadJson(join(STAGING_DIR, 'staging-downloaded.json'))
  const today = new Date().toISOString().slice(0, 10)

  const imageEntries = downloaded.map((d) => ({
    deviceSlug: d.slug,
    manufacturerSlug: d.manufacturerSlug,
    image: {
      kind: 'frontal',
      caption: `${d.title || d.query} frontal`,
      localPath: d.localPath,
      sourceSlug: `brave-search-${d.manufacturerSlug}`,
    },
    sourceEntry: {
      slug: `brave-search-${d.manufacturerSlug}`,
      kind: 'terceros',
      publisher: 'Brave Search (product photo)',
      title: `Product photo for ${d.manufacturerSlug} devices`,
      url: d.imageUrl,
      retrievedOn: today,
      authorityLevel: 3,
    },
    metadata: {
      query: d.query,
      originalUrl: d.imageUrl,
      confidence: d.confidence,
      width: d.width,
      height: d.height,
      webpSize: d.webpSize,
      searchType: d.type,
      categoryCode: d.categoryCode,
    },
  }))

  // Deduplicate source entries (one per manufacturer)
  const sourceMap = new Map()
  for (const entry of imageEntries) {
    const key = entry.sourceEntry.slug
    if (!sourceMap.has(key)) sourceMap.set(key, entry.sourceEntry)
  }

  const outPath = join(STAGING_DIR, 'staging-images.json')
  saveJson(outPath, {
    generatedAt: new Date().toISOString(),
    totalEntries: imageEntries.length,
    sources: [...sourceMap.values()],
    images: imageEntries,
  })

  console.log(`\n📄 staging-images.json generado: ${outPath}`)
  console.log(`   Entradas: ${imageEntries.length} | Fuentes únicas: ${sourceMap.size}`)

  return imageEntries
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const phase = args.includes('--phase') ? Number(args[args.indexOf('--phase') + 1]) : 0
  const dryRun = args.includes('--dry-run')

  console.log('╔══════════════════════════════════════════╗')
  console.log('║   NetAtlas Image Finder v1.0             ║')
  console.log('╚══════════════════════════════════════════╝')

  if (dryRun) {
    const manufacturers = loadJson(join(STAGING_DIR, 'manufacturers.json'))
    const curated = loadJson(join(STAGING_DIR, 'curated-missing.json'))
    console.log(`\nDry run: ${manufacturers.length} manufacturers × 1 + ${curated.length} curated = ${manufacturers.length + curated.length} queries`)
    return
  }

  if (phase === 0 || phase === 1) await phase1Discover()
  if (phase === 0 || phase === 2) await phase2Download()
  if (phase === 0 || phase === 3) phase3Generate()

  console.log('\n✅ Listo. Revisa staging-images.json antes de mergear.')
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
