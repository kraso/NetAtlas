import { describe, expect, it } from 'vitest'
import { construirAlcance, contarDeclaracionesImport } from '../src/alcance.js'

function contenido(lineas: number): string {
  return Array.from({ length: lineas }, (_, indice) => `const linea${indice + 1} = ${indice + 1}`).join('\n')
}

describe('construirAlcance', () => {
  it('manda la cabecera y el cambio, con la numeración real y los huecos marcados', () => {
    const alcance = construirAlcance({
      ruta: 'apps/app/src/demo.ts',
      contenido: contenido(100),
      hunks: [{ desde: 50, hasta: 52, borradas: 1 }],
    })
    expect(alcance.texto).toContain('--- FILE: apps/app/src/demo.ts ---')
    expect(alcance.texto).toContain('[cabecera: líneas 1-40]')
    expect(alcance.texto).toContain('    1 | const linea1 = 1')
    expect(alcance.texto).toContain('… (líneas 41-49 sin cambios, omitidas) …')
    expect(alcance.texto).toContain('[cambio: líneas 50-52]')
    expect(alcance.texto).toContain('   52 | const linea52 = 52')
    expect(alcance.texto).toContain('--- FIN: apps/app/src/demo.ts ---')
    expect(alcance.lineasTotales).toBe(100)
    expect(alcance.lineasCambiadas).toBe(3)
  })

  it('une cabecera y cambio cuando se solapan, sin repetir líneas', () => {
    const alcance = construirAlcance({
      ruta: 'src/corto.ts',
      contenido: contenido(10),
      hunks: [{ desde: 1, hasta: 10, borradas: 0 }],
    })
    expect(alcance.texto).toContain('[cabecera y cambio: líneas 1-10]')
    expect(alcance.texto.match(/cabecera y cambio:/g)).toHaveLength(1)
    expect(alcance.texto).not.toContain('sin cambios, omitidas')
  })

  it('emite las regiones en orden de línea, sin saltos hacia atrás', () => {
    const alcance = construirAlcance({
      ruta: 'src/ordenado.ts',
      contenido: contenido(120),
      hunks: [{ desde: 60, hasta: 62, borradas: 0 }, { desde: 90, hasta: 91, borradas: 0 }],
    })
    const numeros = alcance.texto.split('\n').flatMap((linea) => {
      const coincidencia = /^\s*(\d+) \|/.exec(linea)
      return coincidencia?.[1] === undefined ? [] : [Number.parseInt(coincidencia[1], 10)]
    })
    expect(numeros).toEqual([...numeros].sort((uno, otro) => uno - otro))
    expect(alcance.texto.indexOf('[cabecera: líneas 1-40]')).toBeLessThan(
      alcance.texto.indexOf('[cambio: líneas 60-62]'),
    )
    expect(alcance.texto.indexOf('[cambio: líneas 60-62]')).toBeLessThan(
      alcance.texto.indexOf('[cambio: líneas 90-91]'),
    )
    expect(alcance.texto).toContain('… (líneas 41-59 sin cambios, omitidas) …')
  })

  it('declara las líneas borradas sin mostrarlas', () => {
    const alcance = construirAlcance({
      ruta: 'src/borra.ts',
      contenido: contenido(60),
      hunks: [{ desde: 31, hasta: 30, borradas: 3 }],
    })
    expect(alcance.texto).toContain('[cambio: tras la línea 30 se eliminan 3 líneas]')
    expect(alcance.lineasCambiadas).toBe(0)
  })

  it('publica las métricas que el revisor no puede deducir de un fragmento', () => {
    const fichero = ['import a from "a"', 'import b from "b"', 'export { c } from "c"', ...Array.from({ length: 205 }, () => 'const x = 1')]
    const alcance = construirAlcance({
      ruta: 'src/largo.ts',
      contenido: fichero.join('\n'),
      hunks: [{ desde: 200, hasta: 208, borradas: 0 }],
    })
    expect(alcance.imports).toBe(3)
    expect(alcance.texto).toContain('total=208 líneas; imports=3 declaraciones; cambiadas=9 líneas')
  })
})

describe('contarDeclaracionesImport', () => {
  it('cuenta import y export … from, y nada más', () => {
    expect(
      contarDeclaracionesImport([
        "import type { A } from './a.js'",
        'export { b } from "./b.js"',
        'export const c = 1',
        '// import falso',
      ]),
    ).toBe(2)
  })
})
