/**
 * Dobles de repositorio para los tests de repo-lint: un repo de mentira sobre el
 * que correr las reglas sin tocar el árbol real. Vive aparte para no arrastrar
 * las mismas declaraciones `import` a cada archivo de test.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Raíz del repositorio real (este paquete vive en `tools/repo-lint`). */
export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const temporales: string[] = []

/** Crea un repo de mentira con los archivos indicados (ruta → contenido). */
export function crearRepo(archivos: Readonly<Record<string, string>>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'repo-lint-'))
  temporales.push(raiz)
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const destino = join(raiz, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  return raiz
}

/** Borra los repos de mentira del test en curso. */
export function limpiarRepos(): void {
  for (const raiz of temporales) rmSync(raiz, { recursive: true, force: true })
  temporales.length = 0
}

/** Rutas relativas al repo, con separadores POSIX. */
export function relativas(raiz: string, rutas: readonly string[]): readonly string[] {
  return rutas.map((r) => r.slice(raiz.length + 1).split(sep).join('/'))
}

/** Fuente TS de N líneas exactas (cada línea es una sentencia válida inofensiva). */
export function fuenteDe(lineas: number): string {
  return `${Array.from({ length: lineas }, (_, i) => `const x${i} = ${i}`).join('\n')}\n`
}

/** Barrel de N líneas exactas: solo re-exportaciones. */
export function barrelDe(lineas: number): string {
  return `${Array.from({ length: lineas }, (_, i) => `export { a${i} } from './a.js'`).join('\n')}\n`
}

/** Manifiesto mínimo con nombre. */
export function paquete(nombre: string): string {
  return `${JSON.stringify({ name: nombre, version: '0.0.0', private: true }, null, 2)}\n`
}

/** `pnpm-workspace.yaml` con los globs indicados. */
export function workspace(globs: readonly string[]): string {
  return `packages:\n${globs.map((g) => `  - "${g}"`).join('\n')}\n`
}
