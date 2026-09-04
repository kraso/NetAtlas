/**
 * Fetch MikroTik (Fase catalog-fetch 1): mikrotik.com/product/* expone una
 * tabla "Specifications" estable (<li><span>Clave</span><span>Valor</span>).
 * Solo hechos estructurales (CPU/RAM/arquitectura/código) con allowlist;
 * todo lo demás se ignora. Sin red en tests (parse puro).
 */

export interface MikrotikTarget {
  readonly slug: string
  readonly url: string
  readonly sourceSlug: string
}

/** Dispositivos con contrapartida real (los sintéticos mikrotik-cat-* se excluyen). */
export const MIKROTIK_TARGETS: readonly MikrotikTarget[] = [
  { slug: 'mikrotik-hex-s', url: 'https://mikrotik.com/product/hex_s', sourceSlug: 'mikrotik-hex-s-spec' },
  { slug: 'mikrotik-crs328-24p', url: 'https://mikrotik.com/product/crs328_24p_4s_rm', sourceSlug: 'mikrotik-crs328-spec' },
]

export const FETCH_UA = 'Mozilla/5.0 NetAtlas-curation/1.0'
/** Pausa entre peticiones (respeto al vendor). */
export const FETCH_PAUSE_MS = 2000

function limpio(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrae pares Clave→Valor de la tabla Specifications. Determinista y
 * tolerante a cambios cosméticos (si el layout cambia, devuelve {}).
 */
export function parseMikrotikSpecs(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const items = html.split('<li class="flex gap-2 mtk-text-sm">').slice(1)
  for (const item of items) {
    const spans = [...item.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => limpio(m[1] ?? ''))
      .filter((t) => t.length > 0)
    if (spans.length >= 2) {
      const clave = spans[0]!.replace(/\s+/g, ' ').trim()
      const valor = spans.slice(1).join(' ').replace(/\s+/g, ' ').trim()
      if (clave.length > 0 && clave.length <= 64 && valor.length > 0 && valor.length <= 300) {
        out[clave] = valor
      }
    }
  }
  return out
}

export interface InternalArchValue {
  readonly summary?: string
  readonly cpu?: string
  readonly ram?: string
  readonly soc?: { family: string; note?: string }
}

/**
 * internal-architecture honesto desde specs: exige CPU (sin CPU no hay ficha).
 * RAM/arquitectura opcionales; nada se inventa.
 */
export function specsToInternalArch(specs: Record<string, string>): InternalArchValue | undefined {
  const cpuRaw = specs['CPU']
  if (!cpuRaw) return undefined
  const cores = specs['CPU core count']
  const freq = specs['CPU nominal frequency']
  const nucleos = cores === '1' ? 'núcleo' : 'núcleos'
  const cpu = [cpuRaw, cores ? `(${cores} ${nucleos}` + (freq ? ` @ ${freq}` : '') + ')' : freq ? `(@ ${freq})` : '']
    .filter((p) => p.length > 0)
    .join(' ')
    .slice(0, 200)
  const ram = specs['Size of RAM']
  const arch = specs['Architecture']
  const code = specs['Product code']
  const soc = arch ? { family: `MikroTik ${arch}${code ? ` (${code})` : ''}`, note: 'SoC/plataforma según mikrotik.com' } : undefined
  const summary =
    ram && arch
      ? `Placa ${code ?? ''}: CPU ${cpuRaw} con ${ram} de RAM.`.replace('  ', ' ').trim()
      : undefined
  return {
    ...(summary ? { summary } : {}),
    cpu,
    ...(ram ? { ram } : {}),
    ...(soc ? { soc } : {}),
  }
}

export interface CuratedAssertion {
  readonly predicate: 'internal-architecture'
  readonly value: InternalArchValue
  readonly sourceSlug: string
  readonly confidence: 'third-party'
  readonly note: string
}

/** Envuelve el valor con procedencia para revisión (el seed lo cita tal cual). */
export function toSeedAssertion(
  value: InternalArchValue,
  target: MikrotikTarget,
  url: string,
  dateIso: string,
): CuratedAssertion {
  return {
    predicate: 'internal-architecture',
    value,
    sourceSlug: target.sourceSlug,
    confidence: 'third-party',
    note: `Curado por catalog-fetch desde ${url} el ${dateIso}; validar en F2.`,
  }
}
