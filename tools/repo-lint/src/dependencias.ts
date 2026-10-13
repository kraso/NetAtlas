/**
 * Regla de dependencias internas del workspace (AGENTS.md): una dependencia
 * entre proyectos del repositorio se declara `workspace:*`, nunca con un rango
 * escrito a mano (`^0.0.0`, `workspace:^`, `file:…`, `link:…`).
 *
 * Un rango deja que pnpm resuelva esa dependencia fuera del workspace —contra
 * el registro, o contra una copia que no es la del repo—, y la app pasó a
 * depender de un `@netatlas/server` que no era el suyo. El estándar existía,
 * pero solo lo sostenía un grep a mano: quien lo saltaba no se enteraba.
 *
 * Qué es «interno» sale de `pnpm-workspace.yaml` vía `listarProyectos`, no de
 * una copia hecha aquí: un proyecto nuevo entra en la regla por existir.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listarProyectos } from './nombres.js'

/** Secciones de un manifiesto donde puede declararse una dependencia. */
export const SECCIONES_DEPENDENCIAS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

export type SeccionDependencias = (typeof SECCIONES_DEPENDENCIAS)[number]

/** Única forma admitida de declarar una dependencia interna. */
export const ESPECIFICADOR_INTERNO = 'workspace:*'

export type MotivoDependencia = 'rango-a-mano' | 'especificador-invalido'

export interface ViolacionDependencia {
  /** Por qué se señala: el rango a mano, o un manifiesto mal formado. */
  readonly motivo: MotivoDependencia
  readonly ruta: string
  readonly seccion: SeccionDependencias
  readonly dependencia: string
  readonly declarada: string
  readonly esperada: string
}

export interface InformeDependencias {
  readonly revisados: number
  readonly internas: number
  readonly violaciones: readonly ViolacionDependencia[]
}

interface Declaracion {
  readonly seccion: SeccionDependencias
  readonly dependencia: string
  readonly especificador: unknown
}

/**
 * Declaraciones de dependencia de un manifiesto. Se lee por sección en vez de
 * recorrer el JSON entero: un `name`, un `version` o un script con el mismo
 * nombre que un proyecto no son dependencias y no deben contar. Un especificador
 * que no sea una cadena se recoge igual: la regla lo señala en vez de saltárselo
 * en silencio.
 */
function declaracionesDe(contenido: string): readonly Declaracion[] {
  const manifiesto = JSON.parse(contenido) as Record<string, unknown>
  const declaraciones: Declaracion[] = []
  for (const seccion of SECCIONES_DEPENDENCIAS) {
    const valor = manifiesto[seccion]
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) continue
    for (const [dependencia, especificador] of Object.entries(valor)) {
      declaraciones.push({ seccion, dependencia, especificador })
    }
  }
  return declaraciones
}

/**
 * Lo declarado, en texto: un especificador es una cadena y cualquier otra cosa
 * se muestra como JSON, para que el mensaje diga qué hay escrito de verdad.
 */
function comoTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor : (JSON.stringify(valor) ?? String(valor))
}

/**
 * Dependencias internas declaradas con algo que no sea `workspace:*`, con su
 * ruta, su sección y lo declarado — para que el mensaje diga qué arreglar.
 */
export function revisarDependencias(raizRepo: string): InformeDependencias {
  const proyectos = listarProyectos(raizRepo)
  const internos = new Set(proyectos.map((proyecto) => proyecto.nombre))
  const violaciones: ViolacionDependencia[] = []
  let internas = 0
  for (const proyecto of proyectos) {
    const contenido = readFileSync(join(raizRepo, proyecto.ruta), 'utf8')
    for (const { seccion, dependencia, especificador } of declaracionesDe(contenido)) {
      if (!internos.has(dependencia)) continue
      internas++
      if (especificador === ESPECIFICADOR_INTERNO) continue
      violaciones.push({
        motivo: typeof especificador === 'string' ? 'rango-a-mano' : 'especificador-invalido',
        ruta: proyecto.ruta,
        seccion,
        dependencia,
        declarada: comoTexto(especificador),
        esperada: ESPECIFICADOR_INTERNO,
      })
    }
  }
  violaciones.sort(
    (a, b) => a.ruta.localeCompare(b.ruta) || a.dependencia.localeCompare(b.dependencia),
  )
  return { revisados: proyectos.length, internas, violaciones }
}
