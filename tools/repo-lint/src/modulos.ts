/**
 * Regla de tamaño de módulos del repositorio (AGENTS.md): los módulos se
 * mantienen por debajo de 200 líneas. Los barrels (`index.ts` cuyo único
 * contenido son re-exportaciones) están exentos: su tamaño es la superficie
 * pública del paquete, no lógica.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const MAX_LINEAS = 200

/** Carpetas que nunca contienen módulos fuente que revisar. */
const DIRECTORIOS_IGNORADOS = new Set(['node_modules', 'dist', 'coverage', 'target', '.git'])

export interface ViolacionModulo {
  readonly ruta: string
  readonly lineas: number
  readonly maximo: number
}

export interface InformeModulos {
  readonly revisados: number
  readonly barrels: number
  readonly violaciones: readonly ViolacionModulo[]
}

/** Líneas del archivo con el criterio de `wc -l`: el salto final no cuenta. */
export function contarLineas(contenido: string): number {
  const lineas = contenido.split('\n')
  return lineas[lineas.length - 1] === '' ? lineas.length - 1 : lineas.length
}

/** Una re-exportación completa: `export [type] (*|{…}) [as X] from '…'` ya cerrada. */
const RE_EXPORTACION = /^export\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+[A-Za-z_$][\w$]*)?\s+from\s*(?:'[^']*'|"[^"]*")\s*;?/

/**
 * Un barrel es un `index.ts` cuyas sentencias son todas re-exportaciones. Se
 * consumen una a una y cualquier resto que no sea espacios o `;` lo desmiente:
 * así `export { a } from './a.js'; sideEffect()` NO pasa por barrel, y sí lo son
 * `export * from`, `export type * from` y `export { … } from`.
 */
export function esBarrel(ruta: string, contenido: string): boolean {
  if (!/^index\.tsx?$/.test(ruta.split(/[\\/]/).pop() ?? '')) return false
  let resto = contenidoSinComentarios(contenido)
  let exportaciones = 0
  while (resto !== '') {
    const coincidencia = RE_EXPORTACION.exec(resto)
    if (!coincidencia) return false
    exportaciones++
    resto = resto.slice(coincidencia[0].length).trim()
  }
  // Un `index.ts` sin ninguna re-exportación no es la superficie de nada.
  return exportaciones > 0
}

/** Texto sin comentarios ni espacios repetidos, para analizar por sentencias. */
function contenidoSinComentarios(contenido: string): string {
  return contenido
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Solo módulos fuente: se omiten tests, declaraciones y ficheros de config. */
function esModuloFuente(ruta: string): boolean {
  const nombre = ruta.split(sep).pop() ?? ''
  if (nombre.endsWith('.d.ts')) return false
  if (/\.(test|spec)\.tsx?$/.test(nombre)) return false
  return nombre.endsWith('.ts') || nombre.endsWith('.tsx')
}

function recorrer(dir: string, out: string[]): void {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (!DIRECTORIOS_IGNORADOS.has(entrada.name)) recorrer(join(dir, entrada.name), out)
      continue
    }
    const ruta = join(dir, entrada.name)
    if (esModuloFuente(ruta) && ruta.split(sep).includes('src')) out.push(ruta)
  }
}

/** Rutas absolutas de los módulos de `src` de packages, apps y tools. */
export function listarModulos(raizRepo: string): readonly string[] {
  const out: string[] = []
  for (const base of ['packages', 'apps', 'tools']) {
    const dir = join(raizRepo, base)
    if (existsSync(dir)) recorrer(dir, out)
  }
  return out.sort()
}

/** Revisa todos los módulos del repositorio y devuelve los que exceden el máximo. */
export function revisarRepo(raizRepo: string, maximo: number = MAX_LINEAS): InformeModulos {
  const violaciones: ViolacionModulo[] = []
  let revisados = 0
  let barrels = 0
  for (const ruta of listarModulos(raizRepo)) {
    const contenido = readFileSync(ruta, 'utf8')
    const rutaRel = relative(raizRepo, ruta).split(sep).join('/')
    if (esBarrel(rutaRel, contenido)) {
      barrels++
      continue
    }
    revisados++
    const lineas = contarLineas(contenido)
    if (lineas > maximo) violaciones.push({ ruta: rutaRel, lineas, maximo })
  }
  violaciones.sort((a, b) => b.lineas - a.lineas)
  return { revisados, barrels, violaciones }
}
