import type { ToolContext, HechoIA } from '../src/index.js'

/** ToolContext de prueba: refleja el catálogo demo del seed. */
export const ctxPrueba: ToolContext = {
  async searchCatalog(dsl: string, limit: number) {
    if (dsl.includes('cat:sw')) {
      return [
        { slug: 'cisco-c9300-48p', nombre: 'Cisco Catalyst 9300-48P', categoria: 'Switches multilayer' },
        { slug: 'aruba-6300m-48g', nombre: 'Aruba 6300M 48G', categoria: 'Switches multilayer' },
      ].slice(0, limit)
    }
    if (dsl.includes('cat:rtr')) {
      return [{ slug: 'mikrotik-ccr1036', nombre: 'MikroTik CCR1036-8G-2S+', categoria: 'Routing' }].slice(0, limit)
    }
    return []
  },
  async getDevice(slug: string) {
    if (slug === 'cisco-c9300-48p') {
      return {
        slug,
        nombre: 'Cisco Catalyst 9300-48P',
        fabricante: 'Cisco Systems',
        categoria: 'Switches multilayer',
        lanza: '2020',
        puertos: [
          { label: '48x 10/100/1000', cantidad: 48 },
          { label: '4x SFP+', cantidad: 4 },
        ],
        assertions: [
          { predicado: 'throughput_gbps', valor: '256', fuenteSlug: 'demo-datasheet', fuenteTitulo: 'Datasheet demo' },
        ],
      }
    }
    return undefined
  },
  async compareDevices(ids: string[]) {
    return {
      dispositivos: ids.map((id) => ({ slug: id, nombre: id })),
      diferencias: [
        { clave: 'poe_budget_w', labelEs: 'Presupuesto PoE', valores: { 'cisco-c9300-48p': '—', 'aruba-2930f-48g': '370' } },
      ],
    }
  },
  async findCompatible(device: string, _constraint?: string) {
    if (device === 'cisco-c9300-48p') {
      return { dispositivo: device, compatibles: [{ slug: 'aruba-6300m-48g', nombre: 'Aruba 6300M 48G', via: 'similar-to' }] }
    }
    return { dispositivo: device, compatibles: [] }
  },
  async buildTopology(spec: Readonly<Record<string, unknown>>) {
    return { slug: 'ia-abc123', nombre: String(spec.name ?? 'Topología'), nodos: 3, edges: 2 }
  },
  async whatLayers(slug: string) {
    if (slug === 'cisco-c9300-48p') return { slug, nombre: 'Cisco Catalyst 9300-48P', termina: [1, 2, 3], transparente: [4, 5, 6, 7] }
    return undefined
  },
  async successors(slug: string) {
    return [{ relacion: 'replaced-by', slug: 'cisco-9120axi', nombre: 'Cisco Catalyst 9120AXI' }]
  },
}

const hechosLegitimos: readonly string[] = [
  'cisco-c9300-48p|fabricante|Cisco Systems',
  'cisco-c9300-48p|categoria|Switches multilayer',
  'cisco-c9300-48p|lanza|2020',
  'cisco-c9300-48p|puertos|52',
  'cisco-c9300-48p|throughput_gbps|256',
  'aruba-6300m-48g|categoria|Switches multilayer',
  'aruba-2930f-48g|comparacion|Presupuesto PoE: 370',
  'aruba-6300m-48g|compatible con|cisco-c9300-48p',
  'cisco-9120axi|reemplaza a|cisco-c9300-48p',
  'cisco-c9300-48p|capas que termina|1, 2, 3',
  'cisco-c9300-48p|capas transparente|4, 5, 6, 7',
  'ia-abc123|topologia generada|3 nodos',
]

/** Oráculo que refleja el mismo catálogo de prueba (hechos legítimos). */
export const oraclePrueba = async (h: HechoIA): Promise<boolean> => {
  const valorMin = h.valor.toLowerCase()
  const coincide = hechosLegitimos.some(
    (l) => l.startsWith(`${h.sujetoSlug}|${h.predicado}|`) && l.toLowerCase().split('|')[2] === valorMin,
  )
  return coincide || (h.predicado === 'categoria' && valorMin === 'switches multilayer' && h.sujetoSlug === 'cisco-c9300-48p')
}
