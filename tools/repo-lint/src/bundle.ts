/**
 * Regla del bundle del navegador: ningún `.js` del build de la app puede dejar
 * un import que el navegador no sepa resolver. Solo valen rutas relativas,
 * absolutas y URLs; un specifier desnudo (`@netatlas/data`, `node:sqlite`…)
 * rompe el módulo al cargarlo y la app arranca en blanco.
 *
 * No es hipotético: en la cadena de PRs #11–#16 el barrel de
 * `@netatlas/application` arrastraba `@netatlas/importers` → `@netatlas/data`
 * (external en el build del navegador), el chunk quedaba con
 * `import"@netatlas/data"` y los 80 E2E fallaban por timeout hasta agotar los 30
 * minutos del job, que moría cancelado sin decir por qué.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Carpeta del build del navegador, relativa a la raíz del repositorio. */
export const DIR_DIST = join('apps', 'app', 'dist')

/** Esquemas que un navegador sí sabe cargar. */
const ESQUEMAS_NAVEGADOR = ['http:', 'https:', 'data:', 'blob:']

/** Extensiones que el navegador ejecuta como módulo. */
const EXTENSIONES_JS = ['.js', '.mjs']

export interface ViolacionBundle {
  readonly ruta: string
  readonly specifier: string
}

export interface InformeBundle {
  /** Ficheros `.js` revisados. */
  readonly revisados: number
  /** `true` cuando no hay build que revisar (falta `apps/app/dist`). */
  readonly ausente: boolean
  readonly violaciones: readonly ViolacionBundle[]
}

/** Import solo por efecto: `import"@netatlas/data"`. */
const IMPORT_EFECTO = /(?:^|[;}\n])\s*import\s*["']([^"']+)["']/g
/** Import o re-export con `from`: `import{a}from"…"`, `export*from'…'`. */
const IMPORT_DESDE = /(?:^|[;}\n])\s*(?:import|export)\s*[^;"']{0,400}?from\s*["']([^"']+)["']/g
/** Import dinámico con specifier literal: `import("…")`. El `\b` evita que
 * `cargarImport("x")` (`import` dentro de otro identificador) cuente. */
const IMPORT_DINAMICO = /\bimport\s*\(\s*["']([^"']+)["']/g

const PATRONES = [IMPORT_EFECTO, IMPORT_DESDE, IMPORT_DINAMICO]

/** ¿El navegador puede cargar este specifier tal cual está escrito? */
export function resolublePorElNavegador(specifier: string): boolean {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) return true
  const minusculas = specifier.toLowerCase()
  return ESQUEMAS_NAVEGADOR.some((esquema) => minusculas.startsWith(esquema))
}

/** Specifiers desnudos de un chunk, sin repetir y ordenados. */
export function importsDesnudos(contenido: string): readonly string[] {
  const encontrados = new Set<string>()
  for (const patron of PATRONES) {
    for (const coincidencia of contenido.matchAll(patron)) {
      const specifier = coincidencia[1]
      if (specifier !== undefined && !resolublePorElNavegador(specifier)) encontrados.add(specifier)
    }
  }
  return [...encontrados].sort()
}

/** Todos los `.js` de un directorio y sus subdirectorios, ordenados. */
function listarJs(dir: string): readonly string[] {
  const out: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) out.push(...listarJs(ruta))
    else if (EXTENSIONES_JS.some((ext) => entrada.name.endsWith(ext))) out.push(ruta)
  }
  return out.sort()
}

/** Revisa el build del navegador de la app y devuelve los imports desnudos. */
export function revisarBundle(raizRepo: string): InformeBundle {
  const dist = join(raizRepo, DIR_DIST)
  if (!existsSync(dist)) return { revisados: 0, ausente: true, violaciones: [] }
  const ficheros = listarJs(dist)
  const violaciones: ViolacionBundle[] = []
  for (const fichero of ficheros) {
    const ruta = relative(raizRepo, fichero).split(sep).join('/')
    for (const specifier of importsDesnudos(readFileSync(fichero, 'utf8'))) {
      violaciones.push({ ruta, specifier })
    }
  }
  return { revisados: ficheros.length, ausente: false, violaciones }
}
