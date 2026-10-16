import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularCambio } from '../src/cambio.js'
import { type ConfigGate, CONFIG_POR_DEFECTO } from '../src/config.js'

const CONFIG: ConfigGate = {
  ...CONFIG_POR_DEFECTO,
  proveedor: 'prueba:modelo',
  filePatterns: '*.ts,*.tsx,*.md',
  excludePatterns: '*.test.ts',
}

function git(raiz: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' })
}

function escribir(raiz: string, ruta: string, contenido: string): void {
  writeFileSync(join(raiz, ruta), contenido)
}

function srcCon(linea20: string): string {
  const lineas = Array.from({ length: 30 }, (_, indice) => `const linea${indice + 1} = ${indice + 1}`)
  lineas[19] = linea20
  return lineas.join('\n')
}

function repoDePrueba(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'review-gate-git-'))
  git(raiz, ['init', '-q', '-b', 'main'])
  escribir(raiz, 'src.ts', srcCon('const linea20 = 20'))
  escribir(raiz, 'notas.md', '# notas\n')
  escribir(raiz, 'src.test.ts', 'const prueba = 1\n')
  git(raiz, ['add', '.'])
  git(raiz, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'])
  return raiz
}

describe('calcularCambio', () => {
  it('en modo staged revisa el índice, con las líneas reales del fichero', () => {
    const raiz = repoDePrueba()
    escribir(raiz, 'src.ts', srcCon('const linea20 = "cambiada"'))
    git(raiz, ['add', 'src.ts'])
    const cambio = calcularCambio({ raiz, modo: 'staged', config: CONFIG })
    expect(cambio.ficheros).toEqual(['src.ts'])
    expect(cambio.alcances).toHaveLength(1)
    expect(cambio.alcances[0]?.texto).toContain('[cabecera y cambio: líneas 1-30]')
    expect(cambio.alcances[0]?.texto).toContain('   20 | const linea20 = "cambiada"')
  })

  it('respeta los patrones: los ficheros de test quedan fuera del alcance', () => {
    const raiz = repoDePrueba()
    escribir(raiz, 'src.test.ts', 'const prueba = 2\n')
    escribir(raiz, 'notas.md', '# notas cambiadas\n')
    git(raiz, ['add', '.'])
    const cambio = calcularCambio({ raiz, modo: 'staged', config: CONFIG })
    expect(cambio.ficheros).toEqual(['notas.md'])
    expect(cambio.alcances.map((alcance) => alcance.ruta)).toEqual(['notas.md'])
  })

  it('en modo pr usa el rango contra la base y el contenido del commit, no del árbol', () => {
    const raiz = repoDePrueba()
    git(raiz, ['checkout', '-q', '-b', 'feature'])
    escribir(raiz, 'src.ts', srcCon('const linea20 = "en el commit"'))
    git(raiz, ['add', 'src.ts'])
    git(raiz, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'cambio'])
    escribir(raiz, 'src.ts', 'const basura = "sin commitear"')
    const cambio = calcularCambio({ raiz, modo: 'pr', base: 'main', config: CONFIG })
    expect(cambio.base).toBe('main')
    expect(cambio.alcances).toHaveLength(1)
    expect(cambio.alcances[0]?.texto).toContain('const linea20 = "en el commit"')
    expect(cambio.alcances[0]?.texto).not.toContain('basura')
  })

  it('sin cambios en el índice no hay nada que revisar', () => {
    const cambio = calcularCambio({ raiz: repoDePrueba(), modo: 'staged', config: CONFIG })
    expect(cambio.alcances).toEqual([])
    expect(cambio.ficheros).toEqual([])
  })
})
