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

/** Un barrel es un `index.ts` cuyas líneas solo re-exportan otros módulos. */
export function esBarrel(ruta: string, contenido: string): boolean {
  if (!/^index\.tsx?$/.test(ruta.split(/[\\/]/).pop() ?? '')) return false
  let llaves = 0
  for (const linea of contenido.split('\n')) {
    const t = linea.trim()
    if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    if (llaves === 0 && !/^export\s+(\*|type\s*\{|\{)/.test(t)) return false
    llaves += (t.match(/\{/g)?.length ?? 0) - (t.match(/\}/g)?.length ?? 0)
    if (llaves < 0) return false
  }
  return llaves === 0
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
