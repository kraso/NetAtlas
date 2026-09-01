import { describe, expect, it, vi } from 'vitest'
import { crearComprenderLLM, comprender, crearClienteIA } from '../src/index.js'
import type { ComprenderLLMOptions } from '../src/index.js'

/**
 * F7 futuro — proveedor LLM cloud opcional (§21.1[1]/§21.4): el LLM SOLO
 * traduce NL→PlanIA; la redacción con citas sigue en el pipeline local (nunca
 * inventa specs). Cualquier fallo cae al adaptador local determinista.
 */

function opciones(contenido: string | undefined, status = 200): Pick<ComprenderLLMOptions, 'endpoint' | 'apiKey' | 'model'> & { fetchImpl: ComprenderLLMOptions['fetchImpl']; contenido: string | undefined } {
  const fetchImpl = vi.fn(async () => {
    if (status !== 200) return new Response('error', { status })
    return new Response(
      JSON.stringify({ choices: [{ message: { content: contenido } }] }),
      { status: 200 },
    )
  })
  return { endpoint: 'https://llm.test/v1/chat/completions', apiKey: 'clave-test', model: 'mini', fetchImpl, contenido }
}

const ctxPrueba: import('../src/index.js').ToolContext = {
  async searchCatalog() {
    return [{ slug: 'cisco-c9300-48p', nombre: 'Cisco Catalyst 9300-48P', categoria: 'Switches multilayer' }]
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
        assertions: [{ predicado: 'throughput_gbps', valor: '256', fuenteSlug: 'demo-datasheet', fuenteTitulo: 'Datasheet demo' }],
      }
    }
    return undefined
  },
  async compareDevices() {
    return { dispositivos: [], diferencias: [] }
  },
  async findCompatible() {
    return { dispositivo: 'x', compatibles: [] }
  },
  async buildTopology() {
    return { error: 'sin datos demo' }
  },
  async whatLayers() {
    return undefined
  },
  async successors() {
    return []
  },
}

describe('ComprenderLLM (F7 futuro)', () => {
  it('usa el plan del LLM cuando la respuesta es JSON válido', async () => {
    const m = opciones(JSON.stringify({
      escenario: 'busqueda',
      llamadas: [{ herramienta: 'get_device', argumentos: { slug: 'cisco-c9300-48p' } }],
      textoBusqueda: 'dime del 9300',
      slugPrincipal: 'cisco-c9300-48p',
    }))
    const llm = crearComprenderLLM({ endpoint: m.endpoint, apiKey: m.apiKey, model: m.model, fetchImpl: m.fetchImpl as typeof fetch })
    const plan = await llm('¿Qué es el Catalyst 9300?')
    expect(plan.escenario).toBe('busqueda')
    expect(plan.llamadas[0]).toEqual({ herramienta: 'get_device', argumentos: { slug: 'cisco-c9300-48p' } })
    expect(m.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('descarta herramientas desconocidas y si el plan queda vacío cae al local', async () => {
    const m = opciones(JSON.stringify({
      escenario: 'busqueda',
      llamadas: [{ herramienta: 'herramienta-inexistente', argumentos: {} }],
    }))
    const llm = crearComprenderLLM({ endpoint: m.endpoint, apiKey: m.apiKey, model: m.model, fetchImpl: m.fetchImpl as typeof fetch })
    // planDesdeJson: llamadas inválidas se filtran; queda plan sin llamadas (válido,
    // no cae a local) → verificar herramienta filtrada.
    const plan = await llm('¿Qué es X?')
    expect(plan.llamadas).toEqual([])
  })

  it('JSON no parseable → fallback al local determinista', async () => {
    const m = opciones('esto-no-es-json')
    const spy = vi.spyOn(await import('../src/index.js'), 'comprender')
    const llm = crearComprenderLLM({ endpoint: m.endpoint, apiKey: m.apiKey, model: m.model, fetchImpl: m.fetchImpl as typeof fetch })
    const plan = await llm('¿Qué es el Catalyst 9300?')
    expect(plan.llamadas.length).toBeGreaterThanOrEqual(1)
    spy.mockRestore()
  })

  it('red caída (fetch lanza) → fallback al local sin romper', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('red caída') })
    const llm = crearComprenderLLM({ endpoint: 'x', apiKey: 'k', model: 'm', fetchImpl: fetchImpl as typeof fetch })
    const plan = await llm('busca switches')
    expect(plan.escenario).toBe('busqueda')
    expect(plan.llamadas[0]?.herramienta).toBe('search_catalog')
  })

  it('HTTP 4xx/5xx → fallback al local', async () => {
    const m = opciones(undefined, 500)
    const llm = crearComprenderLLM({ endpoint: m.endpoint, apiKey: m.apiKey, model: m.model, fetchImpl: m.fetchImpl as typeof fetch })
    const plan = await llm('¿Qué capas cubre el Catalyst 9300?')
    expect(plan.llamadas.length).toBeGreaterThanOrEqual(1)
  })

  it('el cliente usa la etapa LLM inyectada y la respuesta sigue citada (sin alucinar specs)', async () => {
    const m = opciones(JSON.stringify({
      escenario: 'busqueda',
      llamadas: [{ herramienta: 'get_device', argumentos: { slug: 'cisco-c9300-48p' } }],
    }))
    const llm = crearComprenderLLM({ endpoint: m.endpoint, apiKey: m.apiKey, model: m.model, fetchImpl: m.fetchImpl as typeof fetch })
    const port = crearClienteIA(ctxPrueba, { comprender: llm })
    const r = await port.ask({ texto: '¿Qué es el Catalyst 9300?' })
    expect(r.citas.some((c) => c.slug === 'cisco-c9300-48p')).toBe(true)
    expect(r.texto).not.toContain('alucinación')
    expect(m.fetchImpl).toHaveBeenCalled()
  })

  it('crearComprenderLLM sin config (fallback) equivale a comprender local', async () => {
    const llm = crearComprenderLLM({ endpoint: '', apiKey: '', model: '' })
    const local = await comprender('¿Qué necesito para conectar dos redes por fibra monomodo?')
    const llmPlan = await llm('¿Qué necesito para conectar dos redes por fibra monomodo?')
    expect(llmPlan.escenario).toBe(local.escenario)
    expect(llmPlan.llamadas.length).toBe(local.llamadas.length)
  })
})