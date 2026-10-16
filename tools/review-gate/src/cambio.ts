import { execFileSync } from 'node:child_process'
import type { AlcanceFichero } from './alcance.js'
import { construirAlcance } from './alcance.js'
import type { ConfigGate } from './config.js'
import { leerHunks } from './hunks.js'
import { filtrarFicheros } from './patrones.js'

/**
 * El cambio a revisar, resuelto contra git. En modo `staged` es lo que está en
 * el índice (lo que se va a commitear) y en modo `pr` el rango `<base>...HEAD`
 * del PR; el contenido que se revisa sale siempre de un objeto de git (índice o
 * commit), no del árbol de trabajo, para que local y CI vean lo mismo.
 */
export type Modo = 'staged' | 'pr'

export interface Cambio {
  modo: Modo
  base: string
  ficheros: string[]
  alcances: AlcanceFichero[]
  /** Ficheros del cambio que traen texto distinto (los de solo modo no se revisan). */
  ignorados: string[]
}

export interface OpcionesCambio {
  raiz: string
  modo: Modo
  base?: string
  config: ConfigGate
}

export function raizRepositorio(desde: string): string {
  return ejecutarGit(desde, ['rev-parse', '--show-toplevel']).trim()
}

export function calcularCambio(opciones: OpcionesCambio): Cambio {
  const { raiz, modo, config } = opciones
  const base = modo === 'pr' ? resolverBase(raiz, opciones.base ?? '', config) : 'HEAD'
  const rango = modo === 'pr' ? [`${base}...HEAD`] : ['--cached']
  const listado = ejecutarGit(raiz, ['diff', '--name-only', '--diff-filter=ACM', ...rango])
  const ficheros = filtrarFicheros(separarLineas(listado), config.filePatterns, config.excludePatterns)
  const hunks = leerHunks(ejecutarGit(raiz, ['diff', '-U0', ...rango]))
  const alcances: AlcanceFichero[] = []
  const ignorados: string[] = []
  for (const ruta of ficheros) {
    const delFichero = hunks.get(ruta) ?? []
    if (delFichero.length === 0) {
      ignorados.push(ruta)
      continue
    }
    alcances.push(construirAlcance({ ruta, contenido: leerContenido(raiz, modo, ruta), hunks: delFichero }))
  }
  return { modo, base, ficheros, alcances, ignorados }
}

/** Base del PR: la que se pase, la del `.gga`, o la primera de las habituales que exista. */
export function resolverBase(raiz: string, preferida: string, config: ConfigGate): string {
  const candidatas = [preferida, config.prBaseBranch, 'main', 'master', 'develop', 'origin/main', 'origin/master', 'origin/develop']
  for (const candidata of candidatas) {
    if (candidata !== '' && existeRef(raiz, candidata)) {
      return candidata
    }
  }
  throw new Error(
    'No se pudo determinar la base del PR: pasa --base=<rama>, define PR_BASE_BRANCH en .gga o trae las ramas main/master/develop al clon.',
  )
}

function existeRef(raiz: string, ref: string): boolean {
  try {
    ejecutarGit(raiz, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

/** El contenido que se revisa: el del índice (staged) o el del commit del PR. */
function leerContenido(raiz: string, modo: Modo, ruta: string): string {
  return ejecutarGit(raiz, ['show', modo === 'pr' ? `HEAD:${ruta}` : `:${ruta}`])
}

function separarLineas(texto: string): string[] {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '')
}

function ejecutarGit(raiz: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'core.quotePath=false', '-C', raiz, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
}
