#!/usr/bin/env tsx
/**
 * catalog:fetch — Uso: pnpm catalog:fetch mikrotik [--out=out/mikrotik.json]
 * Descarga con rate-limit, parsea specs y EMITE JSON para revisión humana
 * (no escribe el seed: el curador revisa el diff antes de aplicarlo).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIKROTIK_TARGETS, FETCH_UA, FETCH_PAUSE_MS, parseMikrotikSpecs, specsToInternalArch, toSeedAssertion } from './mikrotik.js'

const here = dirname(fileURLToPath(import.meta.url))

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': FETCH_UA }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const today = (): string => new Date().toISOString().slice(0, 10)

async function main(): Promise<void> {
  const objetivo = process.argv[2]
  if (objetivo !== 'mikrotik') {
    console.error('Uso: pnpm catalog:fetch mikrotik [--out=out/mikrotik.json]')
    process.exit(2)
  }
  const outPath = arg('out') ?? join(here, '..', 'out', 'mikrotik.json')
  const piezas: unknown[] = []
  for (const [i, target] of MIKROTIK_TARGETS.entries()) {
    if (i > 0) await sleep(FETCH_PAUSE_MS)
    const html = await fetchHtml(target.url)
    const specs = parseMikrotikSpecs(html)
    const arch = specsToInternalArch(specs)
    if (!arch) {
      console.warn(`[catalog-fetch] sin CPU en ${target.url}: se omite (no se inventa).`)
      continue
    }
    piezas.push({ slug: target.slug, assertions: [toSeedAssertion(arch, target, target.url, today())] })
    console.log(`[catalog-fetch] OK ${target.slug}: CPU="${specs['CPU']}" RAM="${specs['Size of RAM'] ?? '—'}"`)
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify({ devices: piezas }, null, 2)}\n`, 'utf8')
  console.log(`[catalog-fetch] revisión en ${outPath} (${piezas.length} fichas)`)
}

void main()
