import { describe, expect, it } from 'vitest'
import {
  crearClienteIA,
  evaluarConjuntoOro,
  hechosDeRespuesta,
  contextoDesdeResultados,
  umbralDepliegue,
} from '../src/index.js'
import type { PreguntaOro } from '../src/index.js'
import { ctxPrueba, oraclePrueba } from './ia-fixtures.js'

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
