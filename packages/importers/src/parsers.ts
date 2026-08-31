import type { RawDevice, RawRecord } from './raw-record.js'

/**
 * Parse de formatos → RawRecord[] (§19.2 etapa 1).
 * JSON: array de objetos dispositivo (convención del seed) o {devices: [...]}.
 * CSV: cabecera con slugs de fabricante/categoría ya resueltos; columnas
 * opcionales puertos/speeds como JSON embebido.
 */
export type ParseError = { record: number; message: string }

export function parseJson(text: string, file = 'memoria.json'): { records: RawRecord[]; errors: ParseError[] } {
  const errors: ParseError[] = []
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch (err) {
    return { records: [], errors: [{ record: 0, message: `JSON inválido: ${(err as Error).message}` }] }
  }
  const list: unknown[] = Array.isArray(payload) ? payload : (payload as { devices?: unknown[] })?.devices ?? []
  if (!Array.isArray(list)) {
    return { records: [], errors: [{ record: 0, message: 'Esperaba un array de dispositivos o {devices:[…]}.' }] }
  }
  const records: RawRecord[] = []
  list.forEach((item, idx) => {
    try {
      const dev = normalizeJsonDevice(item as Record<string, unknown>)
      records.push({ device: dev, source: { file, line: idx + 1 } })
    } catch (err) {
      errors.push({ record: idx + 1, message: (err as Error).message })
    }
  })
  return { records, errors }
}

function normalizeJsonDevice(item: Record<string, unknown>): RawDevice {
  if (typeof item.name !== 'string' || item.name.trim() === '') {
    throw new Error('Falta "name".')
  }
  const requireString = (k: string): string => {
    const v = item[k]
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`Falta "${k}".`)
    return v.trim()
  }
  const dev: RawDevice = {
    slug: typeof item.slug === 'string' ? item.slug : undefined,
    name: item.name.trim(),
    commercialName: typeof item.commercialName === 'string' ? item.commercialName : undefined,
    manufacturerSlug: requireString('manufacturerSlug'),
    familySlug: typeof item.familySlug === 'string' ? item.familySlug : undefined,
    categoryCode: requireString('categoryCode'),
    model: typeof item.model === 'string' ? item.model : undefined,
    sku: typeof item.sku === 'string' ? item.sku : undefined,
    lifecycleStatus: typeof item.lifecycleStatus === 'string' ? item.lifecycleStatus : 'current',
    summary: typeof item.summary === 'string' ? item.summary : undefined,
    releasedOn: typeof item.releasedOn === 'string' ? item.releasedOn : undefined,
    eolOn: typeof item.eolOn === 'string' ? item.eolOn : undefined,
    eosOn: typeof item.eosOn === 'string' ? item.eosOn : undefined,
    osiProfile: item.osiProfile as RawDevice['osiProfile'],
    ports: Array.isArray(item.ports) ? (item.ports as RawDevice['ports']) : undefined,
    assertions: Array.isArray(item.assertions) ? (item.assertions as RawDevice['assertions']) : undefined,
    relationships: Array.isArray(item.relationships) ? (item.relationships as RawDevice['relationships']) : undefined,
  }
  return dev
}

/** Parser CSV mínimo: respeta comillas (escape "" estándar) y saltos incrustados. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const char = text[i]!
    if (inQuotes) {
      if (char === '"') {
        // Escape estándar: "" dentro de campo quoted → literal "
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }
    if (char === '"') { inQuotes = true; i++; continue }
    if (char === ',') { cur.push(field); field = ''; i++; continue }
    if (char === '\n' || char === '\r') {
      if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
      cur = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

/**
 * Parse CSV → RawRecord[]. Cabecera esperada:
 * slug,name,manufacturerSlug,categoryCode,lifecycleStatus,model,summary,portsJson,speedsJson
 */
export function parseCsv(text: string, file = 'memoria.csv'): { records: RawRecord[]; errors: ParseError[] } {
  const errors: ParseError[] = []
  const rows = parseCsvRows(text)
  if (rows.length < 2) return { records: [], errors: [{ record: 0, message: 'CSV sin cabecera o sin filas.' }] }
  const header = rows[0]!.map((h) => h.trim())
  const col = (h: string) => header.indexOf(h)
  const records: RawRecord[] = []
  rows.slice(1).forEach((rowRaw, idx) => {
    const line = idx + 2
    try {
      const get = (name: string): string | undefined => {
        const i = col(name)
        return i === -1 ? undefined : (rowRaw[i] ?? '').trim()
      }
      const name = get('name')
      const manufacturerSlug = get('manufacturerSlug')
      const categoryCode = get('categoryCode')
      if (!name || !manufacturerSlug || !categoryCode) {
        throw new Error(`Fila incompleta: faltan name/manufacturerSlug/categoryCode.`)
      }
      let ports: RawDevice['ports']
      const portsJson = get('portsJson')
      if (portsJson) {
        const parsed = JSON.parse(portsJson) as { label?: string; interfaceCode?: string; quantity?: number; speedsMbps?: number[] }[]
        ports = (Array.isArray(parsed) ? parsed : []).map((p) => ({
          label: String(p.label ?? 'Puerto'),
          interfaceCode: String(p.interfaceCode ?? 'rj45'),
          quantity: Number(p.quantity ?? 1),
          speedsMbps: (p.speedsMbps ?? []).map(Number),
        }))
      }
      records.push({
        device: {
          slug: get('slug') ?? undefined,
          name,
          manufacturerSlug,
          categoryCode,
          lifecycleStatus: get('lifecycleStatus') ?? 'current',
          model: get('model') ?? undefined,
          summary: get('summary') ?? undefined,
          commercialName: get('commercialName') ?? undefined,
          ports,
        },
        source: { file, line },
      })
    } catch (err) {
      errors.push({ record: line, message: (err as Error).message })
    }
  })
  return { records, errors }
}