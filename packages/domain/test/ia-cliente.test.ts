import { describe, expect, it } from 'vitest'
import {
  crearClienteIA,
  evaluarConjuntoOro,
  hechosDeRespuesta,
  verificarAlucinaciones,
  contextoDesdeResultados,
  umbralDepliegue,
} from '../src/index.js'
import type { ToolContext, PreguntaOro, HechoIA } from '../src/index.js'

/** ToolContext de prueba: refleja el catálogo demo del seed. */
const ctxPrueba: ToolContext = {
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
  async findCompatible(device: string, constraint?: string) {
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

/** Oráculo que refleja el mismo catálogo de prueba (hechos legítimos). */
const oraclePrueba = async (h: HechoIA): Promise<boolean> => {
  const legitimas: readonly string[] = [
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
  const valorMin = h.valor.toLowerCase()
  return legitimas.some(
    (l) => l.startsWith(`${h.sujetoSlug}|${h.predicado}|`) && l.toLowerCase().split('|')[2] === valorMin,
  ) || (h.predicado === 'categoria' && valorMin === 'switches multilayer' && h.sujetoSlug === 'cisco-c9300-48p')
}

describe('Cliente IA + RAG con citas (F7, NET-HW-059/060)', () => {
  it('crearClienteIA responde a get_device con hechos citados', async () => {
    const port = crearClienteIA(ctxPrueba)
    const r = await port.ask({ texto: '¿Qué es el Cisco Catalyst 9300?' })
    expect(r.modo).toBe('respuesta')
    expect(r.citas.length).toBeGreaterThanOrEqual(5)
    expect(r.citas.some((c) => c.slug === 'cisco-c9300-48p')).toBe(true)
    expect(r.texto).toContain('Cisco Systems')
    expect(r.texto).toContain('256')
  })

  it('pregunta sin datos → modo no-tengo-datos (guardarraíl de honestidad)', async () => {
    const port = crearClienteIA(ctxPrueba)
    const r = await port.ask({ texto: '¿Qué pasa con algo que no existe en el catálogo?' })
    expect(r.modo).toBe('no-tengo-datos')
    expect(r.texto).toContain('No tengo datos validados')
    expect(r.citas.length).toBe(0)
  })

  it('explicación técnica se marca como explicación generada', async () => {
    const port = crearClienteIA(ctxPrueba)
    const r = await port.ask({ texto: 'Explica qué es un switch multilayer' })
    expect(r.esExplicacion).toBe(true)
    expect(r.modo).toBe('explicacion')
  })

  it('búsqueda de switches devuelve citas de categoría', async () => {
    const port = crearClienteIA(ctxPrueba)
    const r = await port.ask({ texto: 'busca switches' })
    expect(r.citas.some((c) => c.slug === 'cisco-c9300-48p')).toBe(true)
    expect(r.herramientas.length).toBeGreaterThan(0)
  })

  it('build_topology produce cita de topología generada', async () => {
    const port = crearClienteIA(ctxPrueba)
    const r = await port.ask({ texto: 'Crea una topología con dos switches' })
    expect(r.modo).toBe('respuesta')
    expect(r.citas.some((c) => c.tipo === 'topology' && c.slug === 'ia-abc123')).toBe(true)
  })

  it('what_layers responde capas OSI', async () => {
    const port = crearClienteIA(ctxPrueba)
    const r = await port.ask({ texto: '¿Qué capas cubre el Catalyst 9300?' })
    expect(r.texto).toContain('1, 2, 3')
  })

  it('verificarAlucinaciones detecta afirmaciones fuera del contexto', () => {
    const respuesta = {
      texto: 'x',
      citas: [{ tipo: 'device', slug: 'cisco-c9300-48p', etiqueta: 'X', afirmacion: 'throughput_gbps: 99999' }],
      herramientas: [],
      esExplicacion: false,
      modo: 'respuesta' as const,
    }
    const contexto = {
      hechos: [
        { sujeto: 'X', sujetoSlug: 'cisco-c9300-48p', tipoSujeto: 'device', predicado: 'throughput_gbps', valor: '256' },
      ] as readonly HechoIA[],
    }
    const sospechosas = verificarAlucinaciones(respuesta, contexto)
    expect(sospechosas.length).toBe(1)
    expect(sospechosas[0]).toContain('99999')
  })
})

describe('Evaluación con conjunto de oro (criterio F7)', () => {
  const oro: readonly PreguntaOro[] = [
    { pregunta: '¿Qué es el Cisco Catalyst 9300?', hechosEsperados: [{ sujetoSlug: 'cisco-c9300-48p', predicado: 'throughput_gbps', valor: '256' }] },
    { pregunta: '¿Qué capas cubre el Catalyst 9300?', hechosEsperados: [{ sujetoSlug: 'cisco-c9300-48p', predicado: 'capas que termina', valor: '1, 2, 3' }] },
    { pregunta: '¿Qué reemplaza al Catalyst 9300?', hechosEsperados: [{ sujetoSlug: 'cisco-9120axi', predicado: 'reemplaza a', valor: 'cisco-c9300-48p' }] },
    { pregunta: 'busca switches', hechosEsperados: [{ sujetoSlug: 'cisco-c9300-48p', predicado: 'categoria', valor: 'Switches multilayer' }] },
  ]

  it('fidelidad ≥0.95 y 0 alucinaciones con un oráculo correcto', async () => {
    const port = crearClienteIA(ctxPrueba)
    const resultado = await evaluarConjuntoOro(port, oro, oraclePrueba)
    expect(resultado.aprobado).toBe(true)
    expect(resultado.alucinacionesSpecs).toBe(0)
    expect(resultado.fidelidadCitas).toBeGreaterThanOrEqual(0.95)
    expect(umbralDepliegue(resultado).despliega).toBe(true)
  })

  it('un oráculo que rechaza todo → fidelidad 0 y detección de alucinación', async () => {
    const port = crearClienteIA(ctxPrueba)
    const siempreNo: typeof oraclePrueba = async () => false
    const resultado = await evaluarConjuntoOro(port, [{ pregunta: '¿Qué es el Cisco Catalyst 9300?', hechosEsperados: [] }], siempreNo)
    expect(resultado.alucinacionesSpecs).toBeGreaterThan(0)
    expect(umbralDepliegue(resultado).despliega).toBe(false)
  })

  it('hechosDeRespuesta extrae (sujeto, predicado, valor) de las citas', () => {
    const respuesta = {
      texto: 'x',
      citas: [{ tipo: 'device', slug: 'cisco-c9300-48p', etiqueta: 'X', afirmacion: 'throughput_gbps: 256' }],
      herramientas: [],
      esExplicacion: false,
      modo: 'respuesta' as const,
    }
    expect(hechosDeRespuesta(respuesta)).toEqual([{ sujetoSlug: 'cisco-c9300-48p', predicado: 'throughput_gbps', valor: '256' }])
  })

  it('contextoDesdeResultados mapea get_device a hechos con fuente', () => {
    const resultados = [
      {
        herramienta: 'get_device',
        datos: {
          slug: 'cisco-c9300-48p',
          nombre: 'Cisco Catalyst 9300-48P',
          fabricante: 'Cisco Systems',
          puertos: [{ cantidad: 52 }],
          assertions: [{ predicado: 'throughput_gbps', valor: '256', fuenteSlug: 'demo-datasheet' }],
        },
      },
    ]
    const contexto = contextoDesdeResultados(resultados as never, { escenario: 'busqueda', llamadas: [] } as never)
    expect(contexto.hechos.some((h) => h.predicado === 'throughput_gbps' && h.fuenteSlug === 'demo-datasheet')).toBe(true)
    expect(contexto.hechos.some((h) => h.predicado === 'puertos' && h.valor === '52')).toBe(true)
  })
})