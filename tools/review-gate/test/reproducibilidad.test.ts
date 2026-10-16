import { describe, expect, it } from 'vitest'
import type { AlcanceFichero } from '../src/alcance.js'
import { type Revision, interpretarRevision } from '../src/hallazgos.js'
import { mapaAlcances } from '../src/gate.js'
import { alcanceDePrueba } from './soporte.js'
import { clasificar } from '../src/reproducibilidad.js'

const RUTA = 'apps/app/src/demo.ts'

function revision(texto: string): Revision {
  const lectura = interpretarRevision(texto)
  if (!lectura.ok) {
    throw new Error(`respuesta de prueba ilegible: ${lectura.motivo}`)
  }
  return lectura.revision
}

function alcances(): Map<string, AlcanceFichero> {
  return mapaAlcances([alcanceDePrueba(RUTA, 120, 20, 24)])
}

const FALLO_LINEAS = `STATUS: FAILED\nFINDING: ${RUTA}|21|Módulos de menos de 200 líneas|el módulo pasa de 200 líneas\n`

describe('clasificar', () => {
  it('bloquea el hallazgo que aparece en las dos pasadas sobre una línea cambiada', () => {
    const resultado = clasificar(revision(FALLO_LINEAS), revision(FALLO_LINEAS), alcances())
    expect(resultado.bloqueantes).toHaveLength(1)
    expect(resultado.sueltos).toHaveLength(0)
  })

  it('no bloquea el hallazgo que solo vio una pasada: es el ruido que no converge', () => {
    const otra = `STATUS: FAILED\nFINDING: ${RUTA}|22|Funciones de menos de 30 líneas|la función nueva tiene 41 líneas\n`
    const resultado = clasificar(revision(FALLO_LINEAS), revision(otra), alcances())
    expect(resultado.bloqueantes).toHaveLength(0)
    expect(resultado.sueltos).toHaveLength(2)
  })

  it('no bloquea lo reproducido sobre líneas que nadie tocó', () => {
    const fuera = `STATUS: FAILED\nFINDING: ${RUTA}|90|Comentarios de dominio en español|falta el comentario\n`
    const resultado = clasificar(revision(fuera), revision(fuera), alcances())
    expect(resultado.bloqueantes).toHaveLength(0)
    expect(resultado.reproducidosFueraDelCambio).toHaveLength(1)
  })

  it('tolera el desvío de ±3 líneas al citar, pero no más', () => {
    const cerca = `STATUS: FAILED\nFINDING: ${RUTA}|24|Módulos de menos de 200 líneas|el módulo pasa de 200 líneas\n`
    const lejos = `STATUS: FAILED\nFINDING: ${RUTA}|40|Módulos de menos de 200 líneas|el módulo pasa de 200 líneas\n`
    expect(clasificar(revision(FALLO_LINEAS), revision(cerca), alcances()).bloqueantes).toHaveLength(1)
    expect(clasificar(revision(FALLO_LINEAS), revision(lejos), alcances()).bloqueantes).toHaveLength(0)
  })

  it('no empareja reglas distintas aunque caigan en la misma línea', () => {
    const otra = `STATUS: FAILED\nFINDING: ${RUTA}|21|Imports: máximo 5 declaraciones import|sexto import\n`
    expect(clasificar(revision(FALLO_LINEAS), revision(otra), alcances()).bloqueantes).toHaveLength(0)
  })

  it('empareja aunque una pasada no cite línea', () => {
    const sinLinea = `STATUS: FAILED\nFINDING: ${RUTA}|-|Módulos de menos de 200 líneas|el módulo pasa de 200 líneas\n`
    expect(clasificar(revision(FALLO_LINEAS), revision(sinLinea), alcances()).bloqueantes).toHaveLength(1)
  })

  it('un PASSED no aporta hallazgos: no puede bloquear nada', () => {
    const resultado = clasificar(revision('STATUS: PASSED\n'), revision(FALLO_LINEAS), alcances())
    expect(resultado.bloqueantes).toHaveLength(0)
    expect(resultado.sueltos).toHaveLength(1)
  })
})
