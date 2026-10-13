/**
 * Regla del barrel de la aplicación: ningún módulo de la app importa
 * `@netatlas/application` con un import que sobreviva al compilado.
 *
 * El barrel reexporta el caso de importación por lote, que arrastra
 * `@netatlas/importers` → `@netatlas/data`; ese paquete es `external` en el build
 * del navegador, el chunk de entrada queda con `import"@netatlas/data"` y la app
 * arranca en blanco (los E2E mueren por timeout hasta agotar el job). `tsc` no lo
 * ve —el specifier resuelve y compila— y `dist:lint` sí, pero solo después de
 * compilar: esta regla caza la causa en estático, sin build.
 *
 * Los imports de tipo no cuentan: con `verbatimModuleSyntax` el compilado los
 * borra enteros, así que no pueden arrastrar runtime. El build de la app lo
 * demuestra: tres módulos importan tipos del barrel y en `dist` no queda ni un
 * `@netatlas/application`. Lo que se reporta es cualquier forma que emita código
 * —por defecto, `* as ns`, `export * from`, `{ … }` con algún nombre sin `type`,
 * `import {}` y el `import(…)` dinámico en posición de valor—, así que la regla
 * no tiene falsos positivos hoy y sigue cazando el fallo real.
 *
 * Se analiza con el compilador de TypeScript —ya es dependencia del tool— porque
 * decidir si una sentencia sobrevive es semántica del lenguaje y no texto:
 * `import { type A, B }` sobrevive por `B`; `import { type A }` se borra.
 */
import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { listarFuentes } from './modulos.js'

/** Barrel que la app no puede importar en runtime: arrastra código de Node. */
export const BARREL_APLICACION = '@netatlas/application'

/** Módulos de la app que entran en el bundle del navegador. */
export const DIR_APP = join('apps', 'app', 'src')

/** Recorte de la sentencia en el informe: lo justo para reconocerla. */
const MAX_SENTENCIA = 120

export interface ImportDeValor {
  /** Línea 1-based donde empieza la sentencia. */
  readonly linea: number
  /** La sentencia ofensora, en una línea y recortada. */
  readonly sentencia: string
}

export interface ViolacionBarrel extends ImportDeValor {
  readonly ruta: string
}

export interface InformeBarrels {
  /** Módulos de la app revisados. */
  readonly revisados: number
  readonly violaciones: readonly ViolacionBarrel[]
}

/** ¿Los especificadores son todos de tipo? Sin `type`, cada nombre trae código. */
function soloDeTipo(elementos: readonly { readonly isTypeOnly: boolean }[]): boolean {
  return elementos.length > 0 && elementos.every((elemento) => elemento.isTypeOnly)
}

/**
 * ¿La sentencia deja código en el bundle, o la borra el compilado? En los
 * imports el flag `type` vive en el `ImportClause` (`import type { A }`), que es
 * donde el parser lo pone: `ImportDeclaration` no expone `isTypeOnly`.
 */
function sobreviveAlCompilado(sentencia: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isImportDeclaration(sentencia)) {
    const clausula = sentencia.importClause
    if (!clausula) return true // `import 'x'`: solo efecto, pero sí evalúa el módulo
    if (clausula.isTypeOnly) return false // `import type …`
    if (clausula.name) return true // import por defecto
    const enlaces = clausula.namedBindings
    if (!enlaces || !ts.isNamedImports(enlaces)) return true // `* as ns`
    // `import {} from 'x'` también evalúa el módulo: solo se exime con nombres, y todos de tipo.
    return !soloDeTipo(enlaces.elements)
  }
  if (sentencia.isTypeOnly) return false // `export type …`, `export type * from …`
  const clausula = sentencia.exportClause
  if (!clausula || !ts.isNamedExports(clausula)) return true // `export * from`, `export * as ns`
  return !soloDeTipo(clausula.elements)
}

/** ¿Este specifier es el barrel? Se compara el literal: las subrutas son la salida. */
function esElBarrel(modulo: ts.Expression | undefined): boolean {
  return modulo !== undefined && ts.isStringLiteral(modulo) && modulo.text === BARREL_APLICACION
}

/**
 * ¿Esta sentencia importa el barrel y sobrevive al compilado? El `import(…)`
 * dentro de un tipo (`typeof import(…).X`, patrón real del repo) no emite nada,
 * así que la posición decide.
 */
function importaElBarrel(nodo: ts.Node, dentroDeTipo: boolean): boolean {
  if (ts.isImportDeclaration(nodo) || ts.isExportDeclaration(nodo)) {
    return esElBarrel(nodo.moduleSpecifier) && sobreviveAlCompilado(nodo)
  }
  if (dentroDeTipo || !ts.isCallExpression(nodo)) return false
  if (nodo.expression.kind !== ts.SyntaxKind.ImportKeyword) return false
  const [argumento] = nodo.arguments
  return esElBarrel(argumento)
}

/** Sentencias de un módulo que importan el barrel y dejan código en el bundle. */
export function importsDeValor(contenido: string, ruta: string): readonly ImportDeValor[] {
  const fuente = ts.createSourceFile(
    ruta,
    contenido,
    ts.ScriptTarget.ES2022,
    true,
    ruta.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const encontrados: ImportDeValor[] = []
  const anotar = (nodo: ts.Node): void => {
    const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente))
    encontrados.push({
      linea: line + 1,
      sentencia: nodo.getText(fuente).replace(/\s+/g, ' ').slice(0, MAX_SENTENCIA),
    })
  }
  const recorrer = (nodo: ts.Node, enTipo: boolean): void => {
    const dentroDeTipo = enTipo || ts.isTypeNode(nodo)
    if (importaElBarrel(nodo, dentroDeTipo)) anotar(nodo)
    ts.forEachChild(nodo, (hijo) => recorrer(hijo, dentroDeTipo))
  }
  recorrer(fuente, false)
  return encontrados
}

/** Revisa los módulos de la app y devuelve los que importan el barrel en runtime. */
export function revisarBarrels(raizRepo: string): InformeBarrels {
  const modulos = listarFuentes(join(raizRepo, DIR_APP))
  const violaciones: ViolacionBarrel[] = []
  for (const ruta of modulos) {
    const rutaRel = relative(raizRepo, ruta).split(sep).join('/')
    for (const encontrado of importsDeValor(readFileSync(ruta, 'utf8'), rutaRel)) {
      violaciones.push({ ruta: rutaRel, ...encontrado })
    }
  }
  violaciones.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.linea - b.linea)
  return { revisados: modulos.length, violaciones }
}
