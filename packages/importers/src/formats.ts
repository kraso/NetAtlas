import { parse as parseYamlText } from 'yaml'
import { XMLParser } from 'fast-xml-parser'
import type { RawDevice, RawRecord, RawPort } from './raw-record.js'

/**
 * Adaptadores YAML y XML (NET-HW-046, §19.2 etapa 1) → RawRecord[].
 * Aceptan variantes de campo en castellano o inglés y estructuras anidadas
 * genéricas: {devices:[…]}, {dispositivos:[…]}, <catalogo><dispositivo>…
 */

export type ParseError = { record: number; message: string }

interface ParseOut {
  readonly records: RawRecord[]
  readonly errors: ParseError[]
}

/** Extrae la lista de dispositivos de una raíz JSON/YAML/XML parseada. */
function listaDe(raiz: unknown): unknown[] {
  if (Array.isArray(raiz)) return raiz
  if (raiz && typeof raiz === 'object') {
    const obj = raiz as Record<string, unknown>
    for (const key of ['devices', 'dispositivos', 'catalogo', 'netatlas']) {
      const v = obj[key]
      if (Array.isArray(v)) return v as unknown[]
      if (v && typeof v === 'object') {
        // <catalogo><dispositivo>…</dispositivo></catalogo> → el objeto interno es un array
        const inner = Object.values(v as Record<string, unknown>)[0]
        if (Array.isArray(inner)) return inner as unknown[]
      }
    }
    if (obj['device'] && typeof obj['device'] === 'object') return [obj['device']]
    if (obj['dispositivo'] && typeof obj['dispositivo'] === 'object') return [obj['dispositivo']]
    return [obj]
  }
  return []
}

/** Mapea un objeto genérico (JSON/YAML/XML ya convertido) a RawDevice con alias de campos. */
export function mapearEntrada(item: Record<string, unknown>): RawDevice {
  const str = (ks: readonly string[]): string | undefined => {
    for (const k of ks) {
      const v = item[k]
      if (typeof v === 'string' && v.trim() !== '') return v.trim()
      if (v && typeof v === 'object' && typeof (v as { $text?: unknown }).$text === 'string') return String((v as { $text: string }).$text).trim()
    }
    return undefined
  }
  const name = str(['name', 'nombre']) ?? ''
  if (!name) throw new Error('Falta "name"/"nombre".')
  const manufacturerSlug = str(['manufacturerSlug', 'manufacturer', 'fabricante', 'marca'])
  const categoryCode = str(['categoryCode', 'category', 'categoria'])
  if (!manufacturerSlug) throw new Error('Falta "manufacturerSlug"/"fabricante".')
  if (!categoryCode) throw new Error('Falta "categoryCode"/"categoria".')

  const estado = str(['lifecycleStatus', 'lifecycle_status', 'status', 'estado', 'cicloDeVida']) ?? 'current'

  const puertosRaw = (item['ports'] ?? item['puertos']) as unknown
  const ports = Array.isArray(puertosRaw)
    ? (puertosRaw as Record<string, unknown>[]).map((p): RawPort => {
        const speeds = (p['speedsMbps'] ?? p['velocidades'] ?? p['speeds']) as unknown
        const speedList: number[] = Array.isArray(speeds)
          ? speeds.map((s) => Number(String(s).replace(/[^\d]/g, ''))).filter((n) => Number.isFinite(n))
          : typeof speeds === 'string'
            ? speeds.split(/[,\s/]+/).map((s) => Number(s.replace(/[^\d]/g, ''))).filter((n) => Number.isFinite(n))
            : []
        return {
          label: String(p['label'] ?? p['etiqueta'] ?? 'Puerto'),
          interfaceCode: String(p['interfaceCode'] ?? p['interfaz'] ?? 'rj45'),
          quantity: Number(p['quantity'] ?? p['cantidad'] ?? 1),
          speedsMbps: speedList,
          poeStandard: str2(p['poeStandard'] ?? p['poe']),
          role: str2(p['role'] ?? p['rol']),
        }
      })
    : undefined

  const assertions: RawDevice['assertions'] = Array.isArray(item['assertions'] ?? item['afirmaciones'])
    ? (item['assertions'] ?? item['afirmaciones']) as RawDevice['assertions']
    : undefined

  return {
    slug: str(['slug']),
    name,
    commercialName: str(['commercialName', 'commercial_name', 'nombreComercial']),
    manufacturerSlug,
    familySlug: str(['familySlug', 'family', 'familia']),
    categoryCode,
    model: str(['model', 'modelo', 'modulo']),
    sku: str(['sku', 'ref']),
    lifecycleStatus: estado,
    summary: str(['summary', 'resumen', 'descripcion']),
    releasedOn: str(['releasedOn', 'released_on', 'fechaLanzamiento', 'announced']),
    eolOn: str(['eolOn', 'eol']),
    eosOn: str(['eosOn', 'eos']),
    osiProfile: item['osiProfile'] as RawDevice['osiProfile'],
    ports,
    assertions,
    relationships: Array.isArray(item['relationships'] ?? item['relaciones'])
      ? (item['relationships'] ?? item['relaciones']) as RawDevice['relationships']
      : undefined,
  }
}

function str2(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** YAML (lote externo): array de dispositivos o {devices/{dispositivos}:[…]}. */
export function parseYaml(text: string, file = 'memoria.yaml'): ParseOut {
  const errors: ParseError[] = []
  let raiz: unknown
  try {
    raiz = parseYamlText(text)
  } catch (err) {
    return { records: [], errors: [{ record: 0, message: `YAML inválido: ${(err as Error).message}` }] }
  }
  const items = listaDe(raiz)
  const records: RawRecord[] = []
  items.forEach((it, idx) => {
    try {
      records.push({ device: mapearEntrada(it as Record<string, unknown>), source: { file, line: idx + 1 } })
    } catch (err) {
      errors.push({ record: idx + 1, message: (err as Error).message })
    }
  })
  return { records, errors }
}

/** XML (lote externo): <catalogo><dispositivo>…</dispositivo></catalogo>. */
export function parseXml(text: string, file = 'memoria.xml'): ParseOut {
  const errors: ParseError[] = []
  let raiz: unknown
  try {
    raiz = new XMLParser({ ignoreAttributes: false }).parse(text)
  } catch (err) {
    return { records: [], errors: [{ record: 0, message: `XML inválido: ${(err as Error).message}` }] }
  }
  const items = listaDe(raiz)
  const records: RawRecord[] = []
  items.forEach((it, idx) => {
    try {
      records.push({ device: mapearEntrada(it as Record<string, unknown>), source: { file, line: idx + 1 } })
    } catch (err) {
      errors.push({ record: idx + 1, message: (err as Error).message })
    }
  })
  return { records, errors }
}