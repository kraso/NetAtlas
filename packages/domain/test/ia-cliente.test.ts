import { describe, expect, it } from 'vitest'
import { crearClienteIA, verificarAlucinaciones } from '../src/index.js'
import type { HechoIA } from '../src/index.js'
import { ctxPrueba } from './ia-fixtures.js'

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
