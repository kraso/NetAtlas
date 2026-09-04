import { describe, expect, it } from 'vitest'
import { parseMikrotikSpecs, specsToInternalArch, toSeedAssertion, MIKROTIK_TARGETS } from '../src/mikrotik.js'

// Fragmento estructural fiel a mikrotik.com/product/* (valores de ejemplo).
const FIXTURE = `
<div>Specifications</div>
<ul>
<li class="flex gap-2 mtk-text-sm"><span class="basis-1/2 font-bold">Product code</span><span class="basis-1/2 font-light break-words">RB760iGS</span></li>
<li class="flex gap-2 mtk-text-sm"><span class="basis-1/2 font-bold">Architecture</span><span class="basis-1/2 font-light break-words">MMIPS</span></li>
<li class="flex gap-2 mtk-text-sm"><span class="basis-1/2 font-bold">CPU</span><span class="basis-1/2 font-light break-words">MT7621A</span></li>
<li class="flex gap-2 mtk-text-sm"><span class="basis-1/2 font-bold">CPU core count</span><span class="basis-1/2 font-light break-words">2</span></li>
<li class="flex gap-2 mtk-text-sm"><span class="basis-1/2 font-bold">CPU nominal frequency</span><span class="basis-1/2 font-light break-words">880 MHz</span></li>
<li class="flex gap-2 mtk-text-sm"><span class="basis-1/2 font-bold">Size of RAM</span><span class="basis-1/2 font-light break-words">256 MB</span></li>
</ul>`

describe('catalog-fetch mikrotik (offline)', () => {
  it('parsea pares Clave→Valor de la tabla Specifications', () => {
    const specs = parseMikrotikSpecs(FIXTURE)
    expect(specs['Product code']).toBe('RB760iGS')
    expect(specs['CPU']).toBe('MT7621A')
    expect(specs['Size of RAM']).toBe('256 MB')
  })

  it('devuelve {} si el layout cambia (no inventa)', () => {
    expect(parseMikrotikSpecs('<html><body>rediseño total</body></html>')).toEqual({})
    expect(specsToInternalArch({})).toBeUndefined()
  })

  it('compone internal-architecture honesto (CPU exigida, resto opcional)', () => {
    const arch = specsToInternalArch(parseMikrotikSpecs(FIXTURE))!
    expect(arch.cpu).toContain('MT7621A')
    expect(arch.cpu).toContain('880 MHz')
    expect(arch.cpu).toContain('2 núcleos')
    expect(arch.ram).toBe('256 MB')
    expect(arch.soc?.family).toContain('MMIPS')
  })

  it('envuelve con procedencia para revisión', () => {
    const arch = specsToInternalArch(parseMikrotikSpecs(FIXTURE))!
    const a = toSeedAssertion(arch, MIKROTIK_TARGETS[0]!, 'https://mikrotik.com/product/hex_s', '2026-09-04')
    expect(a.predicate).toBe('internal-architecture')
    expect(a.confidence).toBe('third-party')
    expect(a.note).toContain('catalog-fetch')
    expect(a.note).toContain('2026-09-04')
  })
})
