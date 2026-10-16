import { describe, expect, it } from 'vitest'
import { alcanceDePrueba, correrGate } from './soporte.js'

const RUTA = 'apps/app/src/demo.ts'
const ALCANCES = [alcanceDePrueba(RUTA, 120, 20, 24)]
// Regla de juicio, no mecánica: las mecánicas las decide el gate (test/mecanicas.test.ts).
const FALLO = `STATUS: FAILED\nFINDING: ${RUTA}|21|Error handling explícito, nunca silencioso|el catch nuevo se traga el fallo sin registrar nada\n`

describe('ejecutarGate', () => {
  it('bloquea solo lo reproducible: dos pasadas con el mismo hallazgo dan FAILED', () => {
    const { codigo, salida, llamadas } = correrGate([FALLO, FALLO], ALCANCES)
    expect(codigo).toBe(1)
    expect(llamadas).toBe(2)
    expect(salida).toContain('VEREDICTO: FAILED — 1 hallazgo(s) reproducido(s) sobre el cambio')
    expect(salida).toContain('Bloquean — reproducidos en las dos pasadas y sobre líneas cambiadas (1)')
  })

  it('el caso que no convergía: dos pasadas con hallazgos distintos no bloquean', () => {
    const otro = `STATUS: FAILED\nFINDING: ${RUTA}|23|Funciones de menos de 30 líneas|la función nueva tiene 41 líneas\n`
    const { codigo, salida } = correrGate([FALLO, otro], ALCANCES)
    expect(codigo).toBe(0)
    expect(salida).toContain('De una sola pasada — no bloquean (la otra pasada no los vio) (2)')
    expect(salida).toContain('VEREDICTO: PASSED — ningún hallazgo reproducible sobre el cambio')
  })

  it('una primera pasada limpia ahorra la segunda', () => {
    const { codigo, salida, llamadas } = correrGate(['STATUS: PASSED\n'], ALCANCES)
    expect(codigo).toBe(0)
    expect(llamadas).toBe(1)
    expect(salida).toContain('no hizo falta una segunda')
  })

  it('las dos pasadas reciben el mismo prompt, con el alcance y sin el fichero entero', () => {
    const { prompts } = correrGate([FALLO, FALLO], ALCANCES)
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toBe(prompts[1])
    expect(prompts[0]).toContain('[cabecera y cambio: líneas 1-40]')
    expect(prompts[0]).toContain('--- FILE: apps/app/src/demo.ts ---')
    expect(prompts[0]).toContain('FINDING: <ruta>|<línea>|<regla>|<evidencia>')
    expect(prompts[0]).not.toContain('const linea99')
  })

  it('sin decisión posible no aprueba: un veredicto ilegible devuelve 2', () => {
    const { codigo, salida } = correrGate(['no sé qué decir\n', 'tampoco\n'], ALCANCES)
    expect(codigo).toBe(2)
    expect(salida).toContain('La puerta no pudo decidir')
  })

  it('un fallo del proveedor se reintenta antes de darse por vencido', () => {
    const { codigo, llamadas } = correrGate([FALLO, FALLO], ALCANCES, { reintentos: 1 })
    expect(codigo).toBe(1)
    expect(llamadas).toBe(2)
  })

  it('sin proveedor configurado el gate no corre (código 3)', () => {
    const { codigo, salida } = correrGate([FALLO, FALLO], ALCANCES, { gga: 'FILE_PATTERNS="*.ts"' })
    expect(codigo).toBe(3)
    expect(salida).toContain('no tiene proveedor')
  })

  it('sin nada que revisar aprueba sin llamar al proveedor', () => {
    const { codigo, llamadas, salida } = correrGate([], [])
    expect(codigo).toBe(0)
    expect(llamadas).toBe(0)
    expect(salida).toContain('no hay nada que revisar')
  })
})
