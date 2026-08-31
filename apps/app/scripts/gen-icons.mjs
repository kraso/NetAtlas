#!/usr/bin/env node
/**
 * Genera los iconos PNG de NetAtlas para la PWA (NET-HW-051).
 * PNG puro en Node (zlib deflate) — cero dependencias.
 * Diseño: cuadro sobre fondo oscuro del tema; tres nodos conectados en acento,
 * representando un grafo de red (suficiente para manifest 192/512 y favicon).
 *
 * Uso: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// ── Cores (mismo canon visual que tokens.css) ────────────────────────────────
const BG = [13, 17, 23, 255] // #0d1117
const NODE = [79, 140, 255, 255] // #4f8cff (accent)
const LINK = [110, 162, 255, 255] // #6ea2ff (accent-hover)

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function png(size, draw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc(size * (size * 4 + 1)) // fila + filtro 0
  const px = new Uint8Array(size * size * 4)

  // Nodos del grafo (posiciones relativas simplificadas)
  const nodes = [
    [0.25, 0.28],
    [0.75, 0.22],
    [0.5, 0.72],
  ]
  const links = [
    [0, 1],
    [0, 2],
    [1, 2],
  ]
  const r = 0.11 // radio de nodo

  const put = (x, y, color) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    px[i] = color[0]
    px[i + 1] = color[1]
    px[i + 2] = color[2]
    px[i + 3] = color[3]
  }

  // Enlaces (línea gruesa via raster simple)
  for (const [a, b] of links) {
    const [x1, y1] = nodes[a]
    const [x2, y2] = nodes[b]
    const steps = size * 2
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const xt = x1 + (x2 - x1) * t
      const yt = y1 + (y2 - y1) * t
      const th = 0.02 * size
      for (let dx = -th; dx <= th; dx++) for (let dy = -th; dy <= th; dy++) {
        put(Math.round(xt * size + dx), Math.round(yt * size + dy), LINK)
      }
    }
  }

  // Fondo + nodos
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    put(x, y, BG)
    for (const [nx, ny] of nodes) {
      const d = Math.hypot(x / size - nx, y / size - ny)
      if (d <= r) put(x, y, NODE)
    }
  }

  // Codifica filas con filtro 0 (ninguno)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`)
  writeFileSync(file, png(size))
  console.log(`✓ ${file}`)
}

// Favicon SVG (glifo sencillo, reutilizado por el design system)
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="5" fill="#0d1117"/>
  <circle cx="6" cy="7" r="3" fill="none" stroke="#4f8cff" stroke-width="1.5"/>
  <circle cx="18" cy="5" r="3" fill="none" stroke="#4f8cff" stroke-width="1.5"/>
  <circle cx="12" cy="17" r="3" fill="none" stroke="#4f8cff" stroke-width="1.5"/>
  <path d="M8 8.8L10.5 14M16.5 7.8L13.5 14M9.5 17.8h5" fill="none" stroke="#6ea2ff" stroke-width="1.5" stroke-linecap="round"/>
</svg>`
writeFileSync(join(outDir, 'favicon.svg'), favicon)
console.log(`✓ ${join(outDir, 'favicon.svg')}`)