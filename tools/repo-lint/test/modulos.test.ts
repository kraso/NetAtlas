import { describe, expect, it, afterEach } from 'vitest'
import { sep } from 'node:path'
import { MAX_LINEAS, contarLineas, esBarrel, listarModulos, revisarRepo } from '../src/modulos.js'
import { RAIZ_REPO, barrelDe, crearRepo, fuenteDe, limpiarRepos } from './soporte-repo-falso.js'

afterEach(limpiarRepos)

describe('contarLineas', () => {
  it('no cuenta el salto final', () => {
    expect(contarLineas('a\nb\n')).toBe(2)
    expect(contarLineas('a\nb')).toBe(2)
    expect(contarLineas('')).toBe(0)
    expect(contarLineas('\n')).toBe(1)
  })
})

describe('esBarrel', () => {
  it('acepta un index.ts de solo re-exportaciones', () => {
    const contenido = [
      "export { a, b } from './a.js'",
      "export * from './b.js'",
      'export {',
      '  c,',
      "} from './c.js'",
      "export type { D } from './d.js'",
      '// comentario del barrel',
      '',
    ].join('\n')
    expect(esBarrel('packages/x/src/index.ts', contenido)).toBe(true)
  })

  it('acepta las formas de re-exportación de la casa', () => {
    expect(esBarrel('packages/x/src/index.ts', "export * from './a.js'\n")).toBe(true)
    expect(esBarrel('packages/x/src/index.ts', "export type * from './a.js'\n")).toBe(true)
    expect(esBarrel('packages/x/src/index.ts', "export * as ns from './a.js'\n")).toBe(true)
  })

  it('acepta también las comillas dobles, que son la otra grafía válida', () => {
    expect(esBarrel('packages/x/src/index.ts', 'export * from "./a.js"\n')).toBe(true)
    expect(esBarrel('packages/x/src/index.ts', 'export { a } from "./a.js"\n')).toBe(true)
    expect(esBarrel('packages/x/src/index.ts', 'export * as ns from "./a.js"\n')).toBe(true)
    // Grafía rota (comillas desparejadas): no es una re-exportación.
    expect(esBarrel('packages/x/src/index.ts', "export * from './a.js\"\n")).toBe(false)
  })

  it('no exime un index.ts sin ninguna re-exportación', () => {
    expect(esBarrel('packages/x/src/index.ts', '// solo un comentario\n')).toBe(false)
    expect(esBarrel('packages/x/src/index.ts', '')).toBe(false)
  })

  it('rechaza un index.ts con lógica', () => {
    expect(esBarrel('packages/x/src/index.ts', "export { a } from './a.js'\nexport const b = 1\n")).toBe(false)
    expect(esBarrel('packages/x/src/index.ts', "import { a } from './a.js'\n")).toBe(false)
  })

  it('rechaza código colado tras la re-exportación en la misma línea', () => {
    expect(esBarrel('packages/x/src/index.ts', "export { a } from './a.js'; sideEffect()\n")).toBe(false)
    expect(esBarrel('packages/x/src/index.ts', "export * from './a.js'\nconst x = 1\n")).toBe(false)
  })

  it('no exime a ficheros que no son index', () => {
    expect(esBarrel('packages/x/src/otro.ts', "export { a } from './a.js'\n")).toBe(false)
  })
})

describe('listarModulos', () => {
  it('solo mira módulos de src y omite tests, declaraciones y carpetas generadas', () => {
    const raiz = crearRepo({
      'packages/x/src/a.ts': 'export const a = 1\n',
      'packages/x/src/b.tsx': 'export const b = 1\n',
      'packages/x/src/a.test.ts': 'export const t = 1\n',
      'packages/x/src/tipos.d.ts': 'export declare const d: 1\n',
      'packages/x/node_modules/y/src/z.ts': 'export const z = 1\n',
      'packages/x/dist/w.ts': 'export const w = 1\n',
      'apps/y/test/e2e.ts': 'export const e = 1\n',
      'tools/z/src/cli.ts': 'export const c = 1\n',
      'datasets/seed/otro.ts': 'export const o = 1\n',
    })
    const modulos = listarModulos(raiz).map((m) => m.slice(raiz.length + 1).split(sep).join('/'))
    expect(modulos).toEqual(['packages/x/src/a.ts', 'packages/x/src/b.tsx', 'tools/z/src/cli.ts'])
  })
})

describe('revisarRepo', () => {
  it('señala los módulos que superan el máximo y exime al barrel', () => {
    const raiz = crearRepo({
      'packages/x/src/largo.ts': fuenteDe(MAX_LINEAS + 1),
      'packages/x/src/justo.ts': fuenteDe(MAX_LINEAS),
      'packages/x/src/index.ts': barrelDe(MAX_LINEAS + 50),
      'packages/x/src/largo.test.ts': fuenteDe(MAX_LINEAS + 100),
    })
    const informe = revisarRepo(raiz)
    expect(informe.violaciones.map((v) => v.ruta)).toEqual(['packages/x/src/largo.ts'])
    expect(informe.violaciones[0]!.lineas).toBe(MAX_LINEAS + 1)
    expect(informe.revisados).toBe(2)
    expect(informe.barrels).toBe(1)
  })

  it('los barrels solo se eximen si de verdad son re-exportaciones', () => {
    const raiz = crearRepo({
      'packages/x/src/index.ts': `export { a } from './a.js'\n${fuenteDe(MAX_LINEAS + 5)}`,
      'packages/x/src/otro/index.ts': `export { b } from './b.js'; arrancar()\n${barrelDe(MAX_LINEAS)}`,
    })
    const informe = revisarRepo(raiz)
    expect(informe.barrels).toBe(0)
    // El informe ordena por líneas: se compara como conjunto.
    expect(informe.violaciones.map((v) => v.ruta).sort()).toEqual(['packages/x/src/index.ts', 'packages/x/src/otro/index.ts'].sort())
  })

  it('el repositorio real no tiene ningún módulo por encima del máximo', () => {
    const informe = revisarRepo(RAIZ_REPO)
    expect(informe.violaciones).toEqual([])
    expect(informe.revisados).toBeGreaterThan(100)
  })
})
