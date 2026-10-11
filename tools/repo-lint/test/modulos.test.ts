import { describe, expect, it, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_LINEAS, contarLineas, esBarrel, listarModulos, revisarRepo } from '../src/modulos.js'

const raizRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Crea un repo de mentira con los archivos indicados (ruta → contenido). */
function crearRepo(archivos: Readonly<Record<string, string>>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'repo-lint-'))
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const destino = join(raiz, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  return raiz
}

/** Fuente TS de N líneas exactas (cada línea es una sentencia válida inofensiva). */
function fuenteDe(lineas: number): string {
  return `${Array.from({ length: lineas }, (_, i) => `const x${i} = ${i}`).join('\n')}\n`
}

/** Barrel de N líneas exactas: solo re-exportaciones. */
function barrelDe(lineas: number): string {
  return `${Array.from({ length: lineas }, (_, i) => `export { a${i} } from './a.js'`).join('\n')}\n`
}

let temporales: string[] = []

afterEach(() => {
  for (const t of temporales) rmSync(t, { recursive: true, force: true })
  temporales = []
})

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

  it('rechaza un index.ts con lógica', () => {
    expect(esBarrel('packages/x/src/index.ts', "export { a } from './a.js'\nexport const b = 1\n")).toBe(false)
    expect(esBarrel('packages/x/src/index.ts', "import { a } from './a.js'\n")).toBe(false)
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
    temporales.push(raiz)
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
    temporales.push(raiz)
    const informe = revisarRepo(raiz)
    expect(informe.violaciones.map((v) => v.ruta)).toEqual(['packages/x/src/largo.ts'])
    expect(informe.violaciones[0]!.lineas).toBe(MAX_LINEAS + 1)
    expect(informe.revisados).toBe(2)
    expect(informe.barrels).toBe(1)
  })

  it('los barrels solo se eximen si de verdad son re-exportaciones', () => {
    const raiz = crearRepo({
      'packages/x/src/index.ts': `export { a } from './a.js'\n${fuenteDe(MAX_LINEAS + 5)}`,
    })
    temporales.push(raiz)
    const informe = revisarRepo(raiz)
    expect(informe.barrels).toBe(0)
    expect(informe.violaciones.map((v) => v.ruta)).toEqual(['packages/x/src/index.ts'])
  })

  it('el repositorio real no tiene ningún módulo por encima del máximo', () => {
    const informe = revisarRepo(raizRepo)
    expect(informe.violaciones).toEqual([])
    expect(informe.revisados).toBeGreaterThan(100)
  })
})
