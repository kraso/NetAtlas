import type { Hallazgo } from './hallazgos.js'

/**
 * Nomenclatura de AGENTS.md, comprobada por el gate sobre las líneas del cambio:
 * PascalCase para tipos y clases, camelCase para variables y funciones, y
 * snake_case para columnas SQL.
 *
 * La regla solo señala lo que puede decidir sin equivocarse; lo demás se calla.
 * Medido sobre los 331 módulos del repositorio antes de escribirla, cada permiso
 * responde a un caso real que no es una violación:
 *  - PascalCase y MAYÚSCULAS en `const`/`let`/`var`/`function`: los componentes
 *    son `function Dashboard()` y las constantes `MAX_LINEAS`.
 *  - Nombres con `_` delante o detrás (`_util`, `eval_`): el idioma del
 *    repositorio para lo interno y para escapar una palabra reservada.
 *  - Una `const` que copia una columna de la fila que lee (`const parent_id =
 *    r.parent_id`): AGENTS.md pide snake_case para las columnas, así que el
 *    espejo lo hereda.
 *  - Dentro de un SQL, un identificador tras un punto (`${def.idCol}`: es una
 *    variable de JS, no una columna) y el alias de un `AS` (`created_at AS
 *    createdAt`: ahí camelCase es deliberado, es la propiedad de dominio).
 */
export const REGLA_NOMBRES = 'Nomenclatura: camelCase, PascalCase, snake_case'

export interface LineaCambiada {
  numero: number
  texto: string
}

export interface ResultadoNombre {
  hallazgo: Hallazgo
  grupo: 'bloqueante'
}

/** Declaración con nombre propio: `[export] [declare] <clase> <nombre>`. */
const DECLARACION = /^\s*(?:export\s+)?(?:declare\s+)?(class|interface|type|enum|const|let|var|function)\s+([A-Za-z_$][\w$]*)/

const PASCAL = /^[A-Z][A-Za-z0-9]*$/
const CAMEL = /^[a-z][A-Za-z0-9]*$/
const MAYUSCULAS = /^[A-Z][A-Z0-9_]*$/

const DE_TIPO = new Set(['class', 'interface', 'type', 'enum'])

export function revisarNombres(
  ruta: string,
  cambiadas: readonly LineaCambiada[],
  conColumnasSql: boolean,
): ResultadoNombre[] {
  return cambiadas.flatMap((linea) => [
    ...nombreDeDeclaracion(ruta, linea),
    ...(conColumnasSql ? columnasSql(ruta, linea) : []),
  ])
}

function nombreDeDeclaracion(ruta: string, linea: LineaCambiada): ResultadoNombre[] {
  const encontrado = DECLARACION.exec(linea.texto)
  const tipo = encontrado?.[1]
  const nombre = encontrado?.[2]
  if (tipo === undefined || nombre === undefined) return []
  const esDeTipo = DE_TIPO.has(tipo)
  if (loEsperado(esDeTipo, nombre) || esEspejoDeColumna(nombre, linea.texto)) return []
  return [
    {
      hallazgo: {
        ruta,
        linea: linea.numero,
        regla: REGLA_NOMBRES,
        evidencia: `«${nombre}» debería ser ${esDeTipo ? 'PascalCase (tipos y clases)' : 'camelCase (variables y funciones)'}`,
      },
      grupo: 'bloqueante',
    },
  ]
}

function loEsperado(esDeTipo: boolean, nombre: string): boolean {
  if (esDeTipo) return PASCAL.test(nombre)
  if (nombre.startsWith('_') || nombre.endsWith('_')) return true
  return CAMEL.test(nombre) || PASCAL.test(nombre) || MAYUSCULAS.test(nombre)
}

/** ¿La línea lee la misma columna (`r.parent_id`) o la cita (`row['parent_id']`)? */
function esEspejoDeColumna(nombre: string, texto: string): boolean {
  const escapado = nombre.replace(/\$/g, '\\$')
  return new RegExp(`[.'"\`]${escapado}\\b`).test(texto)
}

/** SQL visible en la línea: solo dentro de literales, para no confundir variables. */
const CADENAS = /`([^`]*)`|'([^']*)'|"([^"]*)"/g
const SQL = /\b(select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table|values)\b/i
const IDENTIFICADOR = /[A-Za-z_][A-Za-z0-9_]*/g
/** Mezcla de mayúsculas y minúsculas: lo que en SQL no es snake_case. */
const MIXTA = /[a-z][A-Z]|[A-Z][a-z]/
/** Acceso a propiedad: el identificador es una variable de JS interpolada. */
const TRAS_UN_PUNTO = /\.[\w$]*$/
/** Alias de columna: `… AS createdAt`. */
const TRAS_UN_AS = /\bas\s+$/i

function columnasSql(ruta: string, linea: LineaCambiada): ResultadoNombre[] {
  return literales(linea.texto)
    .filter((literal) => SQL.test(literal))
    .flatMap((literal) => identificadoresMixtos(literal))
    .map((columna) => ({
      hallazgo: {
        ruta,
        linea: linea.numero,
        regla: REGLA_NOMBRES,
        evidencia: `«${columna}» es un nombre de columna SQL y la convención es snake_case`,
      },
      grupo: 'bloqueante',
    }))
}

function literales(texto: string): string[] {
  return [...texto.matchAll(CADENAS)]
    .map((coincidencia) => coincidencia[1] ?? coincidencia[2] ?? coincidencia[3] ?? '')
    .filter((literal) => literal !== '')
}

function identificadoresMixtos(literal: string): string[] {
  const salida: string[] = []
  for (const coincidencia of literal.matchAll(IDENTIFICADOR)) {
    const nombre = coincidencia[0]
    const antes = literal.slice(0, coincidencia.index)
    if (!MIXTA.test(nombre) || TRAS_UN_PUNTO.test(antes) || TRAS_UN_AS.test(antes)) continue
    salida.push(nombre)
  }
  return salida
}
