/**
 * Resolución de specifiers para la regla de frontera: convierte lo que importa
 * un módulo en el fichero del workspace que hay detrás, o en `null` si el
 * specifier es externo.
 *
 * Imita a la del build, que no usa alias: se sigue el `exports` del manifiesto,
 * y la carpeta de cada proyecto sale de `pnpm-workspace.yaml` (`listarProyectos`),
 * no de una copia — un proyecto nuevo entra por existir, viva donde viva.
 *
 * Vive aparte de la regla para que cada módulo quepa en el límite de líneas y
 * para que el acierto de la resolución se pueda leer solo.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { listarProyectos } from './nombres.js'

/** Paquetes internos del workspace. */
const PREFIJO_INTERNO = '@netatlas/'

/** Mensaje de un error, sea o no `Error`. */
function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Ruta relativa a la raíz, siempre con `/`. */
export function relativa(raizRepo: string, ruta: string): string {
  return relative(raizRepo, ruta).split(sep).join('/')
}

/** Manifiesto parseado; si el JSON no vale, el mensaje dice qué fichero es. */
function manifiestoDe(fichero: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(fichero, 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(`manifiesto ilegible en ${fichero}: ${mensajeDe(error)}`)
  }
}

/** Fuente de un módulo; si no se puede leer, el mensaje dice cuál. */
export function fuenteDeModulo(fichero: string): string {
  try {
    return readFileSync(fichero, 'utf8')
  } catch (error) {
    throw new Error(`módulo ilegible en ${fichero}: ${mensajeDe(error)}`)
  }
}

/**
 * Primer candidato que existe, y que sea fichero. Los imports escriben `.js` y
 * en disco está el `.ts`; el destino de `exports` puede venir ya con extensión
 * (`.ts`), así que ese se prueba tal cual antes de probar variantes.
 */
function existente(base: string): string | null {
  const sinExtension = base.endsWith('.js') ? base.slice(0, -3) : base
  const candidatos = [base, `${sinExtension}.ts`, `${sinExtension}.tsx`, join(sinExtension, 'index.ts')]
  return candidatos.find((candidato) => existsSync(candidato) && statSync(candidato).isFile()) ?? null
}

/** Destino declarado en `exports[clave]` del manifiesto, si lo declara. */
function destinoDeclarado(manifiesto: string, clave: string): string | null {
  if (!existsSync(manifiesto)) return null
  const { exports } = manifiestoDe(manifiesto)
  if (typeof exports !== 'object' || exports === null) return null
  const destino = (exports as Record<string, unknown>)[clave]
  return typeof destino === 'string' ? destino : null
}

/** Carpeta de cada proyecto del workspace, por nombre: lo dice `pnpm-workspace.yaml`. */
export function carpetasDeProyectos(raizRepo: string): ReadonlyMap<string, string> {
  const carpetas = new Map<string, string>()
  for (const { nombre, ruta } of listarProyectos(raizRepo)) {
    carpetas.set(nombre, dirname(join(raizRepo, ruta)))
  }
  return carpetas
}

/** Fichero detrás de un specifier, o `null` si es externo al workspace. */
export function resolver(desde: string, specifier: string, carpetas: ReadonlyMap<string, string>): string | null {
  if (specifier.startsWith('.')) return existente(join(dirname(desde), specifier))
  if (!specifier.startsWith(PREFIJO_INTERNO)) return null
  const [paquete, ...resto] = specifier.slice(PREFIJO_INTERNO.length).split('/')
  if (paquete === undefined) return null
  const dir = carpetas.get(`${PREFIJO_INTERNO}${paquete}`)
  if (dir === undefined) return null
  const clave = resto.length === 0 ? '.' : `./${resto.join('/')}`
  const relativoAlPaquete = destinoDeclarado(join(dir, 'package.json'), clave)
  const base = relativoAlPaquete ?? join('src', resto.length === 0 ? 'index' : resto.join('/'))
  return existente(join(dir, base))
}
