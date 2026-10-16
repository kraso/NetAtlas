import { MAX_LINEAS, esBarrel } from '@netatlas/repo-lint'
import { type AlcanceFichero, esDeclaracionImport } from './alcance.js'
import type { Hallazgo } from './hallazgos.js'
import type { Hunk } from './hunks.js'
import { REGLA_NOMBRES, type LineaCambiada, revisarNombres } from './mecanicas-nombres.js'

/**
 * Reglas mecánicas de AGENTS.md que decide el gate, no el proveedor: el límite de
 * líneas del módulo, las declaraciones de import y la nomenclatura. No son
 * juicio —se cuentan y se comparan—, así que se calculan con el contenido delante
 * y valen igual en las dos pasadas, en local y en CI. Un hallazgo del proveedor
 * sobre ellas no cuenta (`esReglaMecanica`): la decisión ya está tomada aquí.
 *
 * Dos de las tres bloquean. El límite de líneas y la nomenclatura son
 * incondicionales: un módulo por encima de 200 líneas se parte y un nombre que no
 * sigue la convención se renombra, sin margen de interpretación. El conteo de
 * declaraciones de import se informa y no bloquea: la reparación que prescribe
 * AGENTS —«reestructurar dependencias (barrel `*-piezas.ts` cuando el barrel
 * simplifique el grafo)»— es un juicio que un número no puede hacer, y forzarlo
 * mecánicamente empuja a partir módulos en piezas que no simplifican nada. El
 * árbol ya trae módulos por encima de 5 sin que nadie los tocara.
 *
 * Bloquea solo lo que el cambio cruza: un fichero que ya venía por encima del
 * límite se avisa y no bloquea, porque uno que ya estaba así no puede bloquear
 * para siempre. Medido en el repo antes de escribirlo: ningún módulo pasa hoy de
 * 200 líneas, y 13 ya declaran más de 5 imports.
 */
export interface Mecanicas {
  /** El cambio cruza el límite: falla el commit. */
  bloqueantes: Hallazgo[]
  /** El fichero ya venía por encima y el cambio no lo cruza: no bloquea. */
  avisos: Hallazgo[]
  /** Lo que el gate cuenta y no bloquea (declaraciones de import). */
  informativos: Hallazgo[]
}

export const REGLA_MODULO = 'Módulos de menos de 200 líneas'
export const REGLA_IMPORTS = 'Imports: máximo 5 declaraciones'

export const MAX_IMPORTS = 5

type Grupo = 'bloqueante' | 'aviso' | 'informativo'

interface Resultado {
  hallazgo: Hallazgo
  grupo: Grupo
}

const GRUPO_DE: Record<Grupo, keyof Mecanicas> = {
  bloqueante: 'bloqueantes',
  aviso: 'avisos',
  informativo: 'informativos',
}

export function revisarMecanicas(alcances: readonly AlcanceFichero[]): Mecanicas {
  const mecanicas: Mecanicas = { bloqueantes: [], avisos: [], informativos: [] }
  for (const alcance of alcances) {
    for (const resultado of revisarFichero(alcance)) {
      mecanicas[GRUPO_DE[resultado.grupo]].push(resultado.hallazgo)
    }
  }
  return mecanicas
}

function revisarFichero(alcance: AlcanceFichero): Resultado[] {
  const lineas = alcance.contenido.split('\n')
  const cambiadas: LineaCambiada[] = lineasCambiadas(alcance.hunks).map((numero) => ({
    numero,
    texto: lineas[numero - 1] ?? '',
  }))
  return [
    ...revisarLimite(alcance),
    ...revisarImports(alcance, cambiadas),
    ...(esFuente(alcance.ruta) ? revisarNombres(alcance.ruta, cambiadas, !esFicheroDeTest(alcance.ruta)) : []),
  ]
}

/** Números de las líneas nuevas que aporta el cambio, en orden. */
export function lineasCambiadas(hunks: readonly Hunk[]): number[] {
  const numeros: number[] = []
  for (const hunk of hunks) {
    for (let linea = hunk.desde; linea <= hunk.hasta; linea += 1) {
      numeros.push(linea)
    }
  }
  return numeros
}

function nombreDe(ruta: string): string {
  const partes = ruta.split('/')
  return partes[partes.length - 1] ?? ''
}

/** Código fuente TS/TSX: donde valen las convenciones de nombres. Los `.d.ts` no. */
export function esFuente(ruta: string): boolean {
  const nombre = nombreDe(ruta)
  return /\.tsx?$/.test(nombre) && !nombre.endsWith('.d.ts')
}

export function esFicheroDeTest(ruta: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(nombreDe(ruta))
}

/**
 * ¿Entra en las reglas de tamaño e imports? Los módulos de `src`, en TS/TSX y sin
 * ser tests ni barrels: las excepciones de AGENTS.md, con el criterio de barrel
 * importado de `repo-lint` para no tener dos versiones de la misma regla. Un
 * barrel queda fuera de las dos: su tamaño y sus re-exportaciones son la
 * superficie pública del paquete, no lógica ni dependencias.
 */
export function esModuloMedible(ruta: string, contenido: string): boolean {
  if (!esFuente(ruta) || esFicheroDeTest(ruta)) return false
  if (!ruta.split('/').includes('src')) return false
  return !esBarrel(ruta, contenido)
}

function revisarLimite(alcance: AlcanceFichero): Resultado[] {
  if (!esModuloMedible(alcance.ruta, alcance.contenido)) return []
  const total = alcance.lineasTotales
  if (total <= MAX_LINEAS) return []
  const cruza = total - crecimientoNeto(alcance) <= MAX_LINEAS
  return [
    {
      hallazgo: {
        ruta: alcance.ruta,
        linea: alcance.hunks[0]?.desde ?? null,
        regla: REGLA_MODULO,
        evidencia: cruza
          ? `el cambio lo lleva a ${total} líneas y el límite es ${MAX_LINEAS}`
          : `ya venía con ${total} líneas (límite ${MAX_LINEAS}) y el cambio no lo cruza`,
      },
      grupo: cruza ? 'bloqueante' : 'aviso',
    },
  ]
}

/** Líneas que el cambio añade de más: las nuevas menos las borradas. */
function crecimientoNeto(alcance: AlcanceFichero): number {
  const borradas = alcance.hunks.reduce((total, hunk) => total + hunk.borradas, 0)
  return alcance.lineasCambiadas - borradas
}

function revisarImports(alcance: AlcanceFichero, cambiadas: readonly LineaCambiada[]): Resultado[] {
  if (!esModuloMedible(alcance.ruta, alcance.contenido)) return []
  const total = alcance.imports
  if (total <= MAX_IMPORTS) return []
  const anadidas = cambiadas.filter((linea) => esDeclaracionImport(linea.texto))
  const cruza = total - anadidas.length <= MAX_IMPORTS
  return [
    {
      hallazgo: {
        ruta: alcance.ruta,
        linea: anadidas[0]?.numero ?? null,
        regla: REGLA_IMPORTS,
        evidencia: cruza
          ? `el cambio lleva el fichero a ${total} declaraciones (máximo ${MAX_IMPORTS})`
          : `el fichero venía con ${total} declaraciones (máximo ${MAX_IMPORTS})`,
      },
      grupo: 'informativo',
    },
  ]
}

/**
 * ¿Un hallazgo del proveedor habla de una regla mecánica? Entonces no cuenta: la
 * decisión la toma el gate con el contenido delante. Las señales son las palabras
 * de AGENTS.md —«200 líneas» del módulo, «declaraciones» de import y los nombres
 * de las tres convenciones—, para no tragarse un hallazgo de juicio.
 */
export function esReglaMecanica(regla: string): boolean {
  const texto = sinDiacriticos(regla.toLowerCase())
  if (/\b200\b/.test(texto) && texto.includes('linea')) return true
  if (texto.includes('import') && texto.includes('declarac')) return true
  return /camelcase|pascalcase|snake_case|nomenclatura/.test(texto)
}

function sinDiacriticos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export { REGLA_NOMBRES }
export type { LineaCambiada }
