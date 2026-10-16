import { describe, expect, it } from 'vitest'
import { interpretarRevision } from '../src/hallazgos.js'

describe('interpretarRevision', () => {
  it('lee un PASSED sin hallazgos', () => {
    const lectura = interpretarRevision('STATUS: PASSED\nTodo cumple.\n')
    expect(lectura).toEqual({ ok: true, revision: { veredicto: 'PASSED', hallazgos: [], contradictorio: false } })
  })

  it('lee los hallazgos con ruta, línea, regla y evidencia', () => {
    const texto = [
      'STATUS: FAILED',
      'FINDING: apps/app/src/demo.ts|88|Módulos de menos de 200 líneas|el módulo llega a 207 líneas',
      'FINDING: `packages/data/src/x.ts`|12-14|Imports: máximo 5 declaraciones|añade un sexto import',
    ].join('\n')
    const lectura = interpretarRevision(texto)
    expect(lectura.ok).toBe(true)
    if (!lectura.ok) {
      return
    }
    expect(lectura.revision.veredicto).toBe('FAILED')
    expect(lectura.revision.hallazgos).toEqual([
      {
        ruta: 'apps/app/src/demo.ts',
        linea: 88,
        regla: 'Módulos de menos de 200 líneas',
        evidencia: 'el módulo llega a 207 líneas',
      },
      {
        ruta: 'packages/data/src/x.ts',
        linea: 12,
        regla: 'Imports: máximo 5 declaraciones',
        evidencia: 'añade un sexto import',
      },
    ])
  })

  it('tolera envoltorios de markdown y el veredicto lejos del principio', () => {
    const relleno = Array.from({ length: 300 }, (_, indice) => `linea ${indice}`).join('\n')
    const lectura = interpretarRevision(`${relleno}\n**STATUS: FAILED**\n- FINDING: src/a.ts:5|Regla|evidencia|detalle\n`)
    expect(lectura.ok).toBe(true)
    if (lectura.ok) {
      expect(lectura.revision.hallazgos[0]?.linea).toBe(5)
    }
  })

  it('tolera que una pasada omita el campo de la línea', () => {
    const lectura = interpretarRevision('STATUS: FAILED\nFINDING: src/a.ts|Regla violada|detalle\n')
    expect(lectura.ok).toBe(true)
    if (lectura.ok) {
      expect(lectura.revision.hallazgos[0]).toEqual({
        ruta: 'src/a.ts',
        linea: null,
        regla: 'Regla violada',
        evidencia: 'detalle',
      })
    }
  })

  it('un veredicto repetido distinto deja la respuesta ambigua', () => {
    const lectura = interpretarRevision('STATUS: PASSED\n…\nSTATUS: FAILED\n')
    expect(lectura).toEqual({ ok: false, motivo: 'la respuesta trae veredictos distintos (PASSED y FAILED)' })
  })

  it('sin veredicto no hay lectura posible', () => {
    expect(interpretarRevision('El código parece correcto.\n')).toEqual({
      ok: false,
      motivo: 'la respuesta no trae ninguna línea «STATUS: PASSED|FAILED»',
    })
  })

  it('un FAILED sin hallazgos parseables no se convierte en aprobación', () => {
    const lectura = interpretarRevision('STATUS: FAILED\n- hay problemas varios\n')
    expect(lectura).toEqual({
      ok: false,
      motivo: 'un veredicto FAILED sin ninguna línea «FINDING:» parseable',
    })
  })

  it('marca como contradictorio un PASSED que además lista hallazgos', () => {
    const lectura = interpretarRevision('STATUS: PASSED\nFINDING: src/a.ts|1|Regla|evidencia\n')
    expect(lectura.ok).toBe(true)
    if (lectura.ok) {
      expect(lectura.revision.contradictorio).toBe(true)
    }
  })
})
