/**
 * Regla de nombres del workspace: dos proyectos no pueden llamarse igual.
 *
 * Un nombre duplicado deja `pnpm --filter <nombre>` ambiguo: resuelve en varios
 * proyectos a la vez, y el que no declara ese binario o ese script tumba la tarea
 * (pasó con `@netatlas/app` en `packages/app` y `apps/app`: el job de Tauri moría
 * con «Command "tauri" not found»). La lista de proyectos sale de
 * `pnpm-workspace.yaml` y no de una copia hecha aquí: si el workspace cambia, la
 * comprobación cambia con él.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface NombreProyecto {
  readonly ruta: string
  readonly nombre: string
}

export interface NombreDuplicado {
  readonly nombre: string
  readonly rutas: readonly string[]
}

export interface InformeNombres {
  readonly revisados: number
  readonly duplicados: readonly NombreDuplicado[]
}

/** Globs declarados en `pnpm-workspace.yaml`. */
export function leerGlobsWorkspace(raizRepo: string): readonly string[] {
  const ruta = join(raizRepo, 'pnpm-workspace.yaml')
  if (!existsSync(ruta)) {
    throw new Error('falta pnpm-workspace.yaml: sin él no se sabe qué directorios forman el workspace')
  }
  const globs: string[] = []
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const coincidencia = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/.exec(linea)
    if (coincidencia?.[1]) globs.push(coincidencia[1])
  }
  if (globs.length === 0) throw new Error('pnpm-workspace.yaml no declara ningún paquete')
  return globs
}

/**
 * Manifiestos de los proyectos de un glob `dir/*`. Cualquier otro patrón rompe
 * fuerte en vez de quedarse sin enumerar: un linter que ignora lo que no entiende
 * deja pasar justo el duplicado que debe cazar.
 */
function manifiestosDelGlob(raizRepo: string, glob: string): readonly string[] {
  if (!glob.endsWith('/*')) {
    throw new Error(`modules:lint no sabe enumerar el patrón de workspace "${glob}"; usa directorios de primer nivel, como "packages/*"`)
  }
  const base = join(raizRepo, glob.slice(0, -2))
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory() && !entrada.name.startsWith('.') && entrada.name !== 'node_modules')
    .map((entrada) => join(base, entrada.name, 'package.json'))
    .filter((manifiesto) => existsSync(manifiesto))
}

/** Manifiestos que pnpm ve como proyectos: los de los globs más la raíz. */
export function listarManifiestos(raizRepo: string): readonly string[] {
  const manifiestos = leerGlobsWorkspace(raizRepo).flatMap((glob) => manifiestosDelGlob(raizRepo, glob))
  const raiz = join(raizRepo, 'package.json')
  if (existsSync(raiz)) manifiestos.push(raiz)
  return [...manifiestos].sort()
}

/** Nombre declarado en un manifiesto, con su ruta relativa al repo. */
function leerNombre(manifiesto: string, raizRepo: string): NombreProyecto {
  const ruta = relative(raizRepo, manifiesto).split(sep).join('/')
  const contenido = JSON.parse(readFileSync(manifiesto, 'utf8')) as { name?: unknown }
  if (typeof contenido.name !== 'string' || contenido.name === '') {
    throw new Error(`${ruta} no declara "name": un proyecto del workspace sin nombre no se puede filtrar`)
  }
  return { ruta, nombre: contenido.name }
}

/**
 * Proyectos del workspace, con su ruta relativa y su nombre: la lista de los
 * proyectos internos. La usan la regla de nombres y la de dependencias, en vez
 * de mantener cada una su copia.
 */
export function listarProyectos(raizRepo: string): readonly NombreProyecto[] {
  return listarManifiestos(raizRepo).map((manifiesto) => leerNombre(manifiesto, raizRepo))
}

/** Nombres repetidos entre los proyectos del workspace, con sus rutas. */
export function revisarNombres(raizRepo: string): InformeNombres {
  const porNombre = new Map<string, string[]>()
  const proyectos = listarProyectos(raizRepo)
  for (const { ruta, nombre } of proyectos) {
    porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), ruta])
  }
  const duplicados = [...porNombre.entries()]
    .filter(([, rutas]) => rutas.length > 1)
    .map(([nombre, rutas]) => ({ nombre, rutas: [...rutas].sort() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  return { revisados: proyectos.length, duplicados }
}
