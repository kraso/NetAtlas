#!/usr/bin/env node
/**
 * image-finder.mjs — Busca fotos de producto para fichas REALES de NetAtlas.
 *
 * ── Por qué este diseño ────────────────────────────────────────────────────
 * Sólo se buscan dispositivos con `model` real en el seed. Las fichas creadas
 * por importación asistida (`devices-generated.json`) no tienen modelo ni SKU:
 * son esqueletos estructurales cuyo nombre —"Dell Technologies IOT 376"— no
 * corresponde a ningún producto existente. Buscar una foto para ellas devuelve
 * imágenes de otro equipo y contamina el catálogo, así que se descartan de
 * forma explícita y quedan reportadas en el plan.
 *
 * Regla de oro (heredada del criterio de curación): la foto debe mostrar el
 * modelo exacto. Si no se consigue, la ficha se queda SIN foto (empty state).
 * Nunca se rellena con una imagen genérica del fabricante.
 *
 * ── Pipeline ──────────────────────────────────────────────────────────────
 *   Fase 1  Brave Image Search → candidatas filtradas por formato y tamaño
 *   Fase 2  descarga a .tmp/ + normalización a webp (ffmpeg, máx 1200 px)
 *   Fase 3  staging revisable: aceptadas + rechazadas con motivo del rechazo
 *   Merge   copia el asset a public/assets/img y aplica el seed (paso aparte,
 *           posterior a la revisión humana del staging)
 *
 * ── Uso ───────────────────────────────────────────────────────────────────
 *   node tools/image-finder/image-finder.mjs --dry-run      # plan, sin gastar queries
 *   node tools/image-finder/image-finder.mjs --phase 1      # descubrir URLs
 *   node tools/image-finder/image-finder.mjs --phase 2      # descargar y convertir
 *   node tools/image-finder/image-finder.mjs --phase 3      # generar staging
 *   node tools/image-finder/image-finder.mjs --limit 20     # tope de queries
 *   node tools/image-finder/image-finder.mjs --only=slug,slug
 *
 * Env requerido: BRAVE_API_KEY — nunca se escribe en el código.
 *   PowerShell (persistente):  [Environment]::SetEnvironmentVariable('BRAVE_API_KEY','<key>','User')
 *   Alternativa:               node --env-file=.env tools/image-finder/image-finder.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const PUBLIC_IMG = join(ROOT, 'apps', 'app', 'public', 'assets', 'img')
const SEED_DIR = join(ROOT, 'datasets', 'seed')
const STAGING_DIR = __dirname
const TMP_DIR = join(STAGING_DIR, '.tmp')

// ── Umbrales de calidad ───────────────────────────────────────────────────
// Una foto por debajo de estos mínimos suele ser un logo, un icono o una
// miniatura: exactamente lo que llegó al catálogo en la pasada anterior.
const MIN_WIDTH = 400
const MIN_HEIGHT = 300
const MIN_DOWNLOAD_BYTES = 5000
const MIN_WEBP_BYTES = 8000
const MAX_WIDTH_OUT = 1200

// Tier gratuito de Brave: 50 queries/mes. Se deja margen deliberadamente.
const DEFAULT_BUDGET = 45
const CONCURRENCY = 3
const DELAY_MS = 300

const BRAVE_IMG_URL = 'https://api.search.brave.com/res/v1/images/search'

/**
 * La clave se exige sólo cuando se va a llamar a la API: el plan (--dry-run)
 * y las fases locales (2 y 3) no la necesitan.
 */
function requireKey() {
  const key = process.env.BRAVE_API_KEY
  if (!key) {
    console.error('\nFalta BRAVE_API_KEY. Definila como variable de entorno (ver README) e intentá de nuevo.')
    console.error("  PowerShell: [Environment]::SetEnvironmentVariable('BRAVE_API_KEY','<key>','User')\n")
    process.exit(1)
  }
  return key
}

// ── Código de categoría → sustantivo en inglés (para la query) ─────────────
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
  'CAT-IFC': 'network interface card', 'CAT-PAS': 'passive cabling',
}

// ── Helpers ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function loadJsonIfExists(path, fallback) {
  return existsSync(path) ? loadJson(path) : fallback
}

function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function parseArgs(argv) {
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const only = (argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '')
  return {
    dryRun: argv.includes('--dry-run'),
    phase: Number(value('--phase') ?? 0),
    limit: Number(value('--limit') ?? DEFAULT_BUDGET),
    only: only ? only.split(',').map((s) => s.trim()).filter(Boolean) : [],
  }
}

// ── Objetivos: sólo fichas con modelo real y sin foto ─────────────────────
/**
 * Construye la lista de objetivos a partir del seed.
 * `curated-missing.json` actúa como override manual de la query por slug
 * (útil cuando el nombre del modelo es ambiguo para un buscador).
 */
function buildTargets(onlySlugs) {
  // `curated: false` marca las fichas de importación asistida: son esqueletos
  // estructurales y sin modelo no corresponden a ningún producto fotografiable.
  const devices = [
    ...loadJson(join(SEED_DIR, 'devices.json')).map((d) => ({ ...d, curated: true })),
    ...loadJsonIfExists(join(SEED_DIR, 'devices-generated.json'), []).map((d) => ({ ...d, curated: false })),
  ]
  const overrides = loadJsonIfExists(join(STAGING_DIR, 'curated-missing.json'), [])

  const targets = []
  const skipped = []

  for (const d of devices) {
    if ((d.images ?? []).length > 0) continue

    const model = String(d.model ?? '').trim()
    const override = overrides.find((o) => o.slug === d.slug)

    if (model === '' && !override) {
      skipped.push({
        slug: d.slug,
        name: d.name,
        reason: d.curated
          ? 'ficha curada sin "model": completá el modelo en devices.json o agregá un override'
          : 'esqueleto estructural (importación asistida): no corresponde a un producto real',
      })
      continue
    }
    if (onlySlugs.length > 0 && !onlySlugs.includes(d.slug)) continue

    const noun = CATEGORY_LABELS[d.categoryCode] ?? 'networking device'
    const query = (override?.query ?? `${d.name} ${model} ${noun}`).replace(/\s+/g, ' ').trim()

    targets.push({
      slug: d.slug,
      name: d.name,
      model,
      manufacturerSlug: d.manufacturerSlug,
      categoryCode: d.categoryCode,
      query,
    })
  }

  return { targets, skipped }
}

// ── Brave ─────────────────────────────────────────────────────────────────
async function braveImageSearch(query, count = 5) {
  const params = new URLSearchParams({ q: query, count: String(count), safesearch: 'strict' })
  const resp = await fetch(`${BRAVE_IMG_URL}?${params}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': requireKey() },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Brave ${resp.status}: ${body.substring(0, 200)}`)
  }
  return resp.json()
}

/**
 * Elige la mejor candidata aplicando los umbrales. Devuelve también las
 * rechazadas con el motivo, para que el rechazo quede auditable en el staging.
 */
function pickBestImage(results) {
  const rejected = []
  const accepted = []

  for (const r of results ?? []) {
    const url = r.properties?.url
    const w = r.properties?.width ?? 0
    const h = r.properties?.height ?? 0
    if (!url) {
      rejected.push({ url: null, reason: 'sin URL de imagen' })
      continue
    }
    if (url.endsWith('.svg')) {
      rejected.push({ url, reason: 'svg: no es una foto de producto' })
      continue
    }
    if (w < MIN_WIDTH || h < MIN_HEIGHT) {
      rejected.push({ url, reason: `demasiado chica: ${w}x${h} (mínimo ${MIN_WIDTH}x${MIN_HEIGHT})` })
      continue
    }
    accepted.push(r)
  }

  const confOrder = { high: 0, medium: 1, low: 2 }
  accepted.sort((a, b) => {
    const ca = confOrder[a.confidence] ?? 3
    const cb = confOrder[b.confidence] ?? 3
    if (ca !== cb) return ca - cb
    return (b.properties.width || 0) - (a.properties.width || 0)
  })

  return { best: accepted[0] ?? null, rejected }
}

// ── Descarga y normalización ──────────────────────────────────────────────
async function downloadImage(url, destPath) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NetAtlas/1.0)' },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length < MIN_DOWNLOAD_BYTES) {
    throw new Error(`archivo sospechosamente chico: ${buf.length} bytes (mínimo ${MIN_DOWNLOAD_BYTES})`)
  }
  writeFileSync(destPath, buf)
  return buf.length
}

/** Normaliza a webp con ancho máximo y valida el peso final. */
function convertToWebp(inputPath, outputPath) {
  const vf = `scale='min(${MAX_WIDTH_OUT},iw)':-2`
  execSync(`ffmpeg -y -i "${inputPath}" -vf ${vf} -quality 80 "${outputPath}"`, {
    timeout: 30000,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const size = statSync(outputPath).size
  if (size < MIN_WEBP_BYTES) {
    rmSync(outputPath, { force: true })
    throw new Error(`webp final demasiado chico: ${size} bytes (mínimo ${MIN_WEBP_BYTES}) → probable logo o icono`)
  }
  return size
}

// ── Fase 1: descubrir URLs ────────────────────────────────────────────────
async function phase1Discover({ limit, only }) {
  const { targets, skipped } = buildTargets(only)
  const budget = Math.min(limit, targets.length)

  console.log(`\n🔍 Fase 1: ${targets.length} objetivo(s) real(es) · presupuesto ${budget} quer${budget === 1 ? 'y' : 'ies'}`)
  if (skipped.length > 0) {
    console.log(`   (${skipped.length} ficha(s) descartada(s) por no tener modelo real)`)
  }

  const results = []
  let spent = 0

  for (let i = 0; i < budget; i++) {
    const t = targets[i]
    process.stdout.write(`  [${i + 1}/${budget}] "${t.query}" ... `)

    try {
      const data = await braveImageSearch(t.query, 5)
      const { best, rejected } = pickBestImage(data.results)
      spent++

      if (best) {
        results.push({
          ...t,
          imageUrl: best.properties.url,
          pageUrl: best.page_url ?? best.url ?? null,
          siteName: best.source ?? null,
          searchTitle: best.title ?? '',
          confidence: best.confidence ?? 'unknown',
          width: best.properties.width ?? 0,
          height: best.properties.height ?? 0,
          rejected,
        })
        console.log(`✅ ${best.confidence ?? '?'} (${best.properties.width}x${best.properties.height})`)
      } else {
        results.push({ ...t, imageUrl: null, rejected, error: 'ninguna candidata pasó los filtros' })
        console.log(`❌ ninguna pasó los filtros (${rejected.length} rechazadas)`)
      }
    } catch (err) {
      results.push({ ...t, imageUrl: null, rejected: [], error: err.message })
      console.log(`❌ ${err.message}`)
    }

    if (i < budget - 1) await sleep(DELAY_MS)
  }

  const outPath = join(STAGING_DIR, 'staging-urls.json')
  saveJson(outPath, { generatedAt: new Date().toISOString(), queriesSpent: spent, results })
  console.log(`\n📄 ${outPath}`)
  console.log(`   Aceptadas: ${results.filter((r) => r.imageUrl).length}/${results.length} · queries gastadas: ${spent}`)
  console.log('   ⚠️  Revisá staging-urls.json: una URL aceptada NO garantiza que la foto sea del modelo correcto.')
}

// ── Fase 2: descargar y convertir a .tmp/ ─────────────────────────────────
async function phase2Download() {
  const staging = loadJson(join(STAGING_DIR, 'staging-urls.json'))
  const candidates = staging.results.filter((r) => r.imageUrl)

  console.log(`\n📥 Fase 2: descargando ${candidates.length} imagen(es) a .tmp/ ...`)
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })

  const accepted = []
  const rejected = []

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (item) => {
        const label = `  [${i + batch.indexOf(item) + 1}/${candidates.length}] ${item.slug}`
        const rawPath = join(TMP_DIR, `${item.slug}-raw`)
        const outName = `${item.slug}-frontal.webp`
        const tmpWebp = join(TMP_DIR, outName)
        try {
          const rawSize = await downloadImage(item.imageUrl, rawPath)
          const webpSize = convertToWebp(rawPath, tmpWebp)
          rmSync(rawPath, { force: true })
          accepted.push({ ...item, tmpPath: outName, localPath: `assets/img/${outName}`, rawSize, webpSize })
          console.log(`${label}: ✅ ${rawSize} B → webp ${webpSize} B`)
        } catch (err) {
          rejected.push({ slug: item.slug, query: item.query, imageUrl: item.imageUrl, reason: err.message })
          console.log(`${label}: ❌ ${err.message}`)
        }
      }),
    )
  }

  saveJson(join(STAGING_DIR, 'staging-downloaded.json'), {
    generatedAt: new Date().toISOString(),
    accepted,
    rejected,
  })
  console.log(`\n📄 ${join(STAGING_DIR, 'staging-downloaded.json')}`)
  console.log(`   Aceptadas: ${accepted.length}/${candidates.length}`)
}

// ── Fase 3: staging revisable ─────────────────────────────────────────────
function phase3Generate() {
  const { accepted, rejected } = loadJson(join(STAGING_DIR, 'staging-downloaded.json'))
  const today = new Date().toISOString().slice(0, 10)

  const images = accepted.map((d) => ({
    deviceSlug: d.slug,
    deviceName: d.name,
    tmpPath: d.tmpPath,
    image: {
      kind: 'frontal',
      // La caption nombra el modelo: si la foto no es de ese modelo, se ve al revisar.
      caption: `${d.name} (${d.model}) frontal`,
      localPath: d.localPath,
      sourceSlug: `${d.slug}-photo-web`,
    },
    sourceEntry: {
      slug: `${d.slug}-photo-web`,
      kind: 'terceros',
      publisher: d.siteName ?? 'Búsqueda de imágenes (Brave Search)',
      title: `Foto de producto: ${d.name} (${d.model})`,
      url: d.pageUrl ?? d.imageUrl,
      retrievedOn: today,
      authorityLevel: 3,
    },
    metadata: {
      query: d.query,
      imageUrl: d.imageUrl,
      pageUrl: d.pageUrl ?? null,
      searchTitle: d.searchTitle,
      confidence: d.confidence,
      width: d.width,
      height: d.height,
      webpSize: d.webpSize,
      categoryCode: d.categoryCode,
    },
  }))

  const outPath = join(STAGING_DIR, 'staging-images.json')
  saveJson(outPath, {
    generatedAt: new Date().toISOString(),
    totalEntries: images.length,
    sources: images.map((i) => i.sourceEntry),
    images,
    rejected,
  })

  console.log(`\n📄 ${outPath}`)
  console.log(`   Aceptadas: ${images.length} · rechazadas: ${rejected.length}`)
  console.log('\n⚠️  Paso obligatorio antes del merge: abrí cada imagen de .tmp/ y confirmá que')
  console.log('    muestra EL MODELO EXACTO. Borrá del staging las que no correspondan.')
}

// ── Plan (--dry-run) ──────────────────────────────────────────────────────
function printPlan({ limit, only }) {
  const { targets, skipped } = buildTargets(only)
  const budget = Math.min(limit, targets.length)

  console.log(`\nPlan de búsqueda (no se gasta ninguna query)`)
  console.log(`  Objetivos: fichas con "model" real y sin foto → ${targets.length}`)
  if (targets.length > 0) {
    console.log('')
    for (const t of targets.slice(0, 20)) {
      console.log(`    · ${t.slug}`)
      console.log(`        query: "${t.query}"`)
    }
    if (targets.length > 20) console.log(`    … y ${targets.length - 20} más`)
  }
  console.log('')
  console.log(`  Queries a gastar: ${budget} de un presupuesto de ${limit} (tier gratuito Brave: 50/mes)`)
  console.log(`  Descartadas por no ser fotografiable: ${skipped.length}`)
  if (skipped.length > 0) {
    const porMotivo = new Map()
    for (const s of skipped) {
      const g = porMotivo.get(s.reason) ?? { n: 0, ejemplo: s }
      g.n++
      porMotivo.set(s.reason, g)
    }
    for (const [motivo, g] of porMotivo) {
      console.log(`     ${g.n} → ${motivo}`)
      console.log(`         ejemplo: ${g.ejemplo.slug} — "${g.ejemplo.name}"`)
    }
  }
  console.log('')
  if (targets.length === 0) {
    console.log('  Nada para buscar. Para agregar un objetivo: curá la ficha con su "model"')
    console.log('  real en datasets/seed/devices.json, o agregá un override de query en')
    console.log('  curated-missing.json.')
  } else {
    console.log('  Siguiente paso: --phase 1 → revisar staging-urls.json → --phase 2 → --phase 3')
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.log('╔══════════════════════════════════════════╗')
  console.log('║   NetAtlas Image Finder v2.0             ║')
  console.log('╚══════════════════════════════════════════╝')

  if (args.dryRun) {
    printPlan(args)
    return
  }

  if (args.phase === 0 || args.phase === 1) await phase1Discover(args)
  if (args.phase === 0 || args.phase === 2) await phase2Download()
  if (args.phase === 0 || args.phase === 3) phase3Generate()

  console.log('\n✅ Listo. Revisá staging-images.json y .tmp/ antes de mergear.')
}

main()
