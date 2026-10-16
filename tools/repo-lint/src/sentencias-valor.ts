/**
 * Análisis compartido: qué sentencias de import/export dejan código en el
 * bundle y cuáles borra el compilado.
 *
 * Se decide con el compilador de TypeScript —ya es dependencia del tool— porque
 * la pregunta es semántica y no texto: `import { type A, B }` sobrevive por `B`,
 * `import { type A }` se borra, y un `import(…)` dentro de un tipo
 * (`typeof import(…).X`, patrón real del repo) no emite nada. Las dos reglas que
 * miran imports de valor —el barrel de la app y la frontera del bundle— toman la
 * decisión de aquí: dos copias de esto se separarían.
 */
import ts from 'typescript'

/** Recorte de la sentencia en el informe: lo justo para reconocerla. */
const MAX_SENTENCIA = 120

export interface SentenciaDeValor {
  readonly specifier: string
  /** Línea 1-based donde empieza la sentencia. */
  readonly linea: number
  /** La sentencia ofensora, en una línea y recortada. */
  readonly sentencia: string
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
    // `import {} from 'x'` también evalúa el módulo: solo se exime si hay nombres y todos son de tipo.
    return !soloDeTipo(enlaces.elements)
  }
  if (sentencia.isTypeOnly) return false // `export type …`, `export type * from …`
  const clausula = sentencia.exportClause
  if (!clausula || !ts.isNamedExports(clausula)) return true // `export * from`, `export * as ns`
  return !soloDeTipo(clausula.elements)
}

/** Fuente parseada, con el dialecto que corresponde a la extensión. */
function fuenteDe(contenido: string, ruta: string): ts.SourceFile {
  return ts.createSourceFile(
    ruta,
    contenido,
    ts.ScriptTarget.ES2022,
    true,
    ruta.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

/** ¿Esta llamada es un `import(…)` dinámico? Un `import` suelto no es una llamada. */
function esImportDinamico(nodo: ts.Node): nodo is ts.CallExpression {
  return ts.isCallExpression(nodo) && nodo.expression.kind === ts.SyntaxKind.ImportKeyword
}

/**
 * Specifier literal, si lo es: cadena o plantilla sin sustituciones —
 * `import(`node:fs`)` es el mismo builtin y el navegador tampoco lo carga.
 */
function literalDe(nodo: ts.Expression | undefined): string | null {
  if (nodo === undefined) return null
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text
  return null
}

/**
 * Sentencias de import/export de un módulo que dejan código en el bundle, con
 * el specifier de cada una. El `import(…)` dentro de un tipo (`typeof
 * import(…).X`) no emite nada, así que la posición del nodo decide.
 */
export function sentenciasDeValor(contenido: string, ruta: string): readonly SentenciaDeValor[] {
  const fuente = fuenteDe(contenido, ruta)
  const encontradas: SentenciaDeValor[] = []
  const anotar = (nodo: ts.Node, specifier: string): void => {
    const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente))
    encontradas.push({
      specifier,
      linea: line + 1,
      sentencia: nodo.getText(fuente).replace(/\s+/g, ' ').slice(0, MAX_SENTENCIA),
    })
  }
  const recorrer = (nodo: ts.Node, enTipo: boolean): void => {
    const dentroDeTipo = enTipo || ts.isTypeNode(nodo)
    if (ts.isImportDeclaration(nodo) || ts.isExportDeclaration(nodo)) {
      const specifier = literalDe(nodo.moduleSpecifier)
      if (specifier !== null && sobreviveAlCompilado(nodo)) anotar(nodo, specifier)
    } else if (!dentroDeTipo && esImportDinamico(nodo)) {
      const [argumento] = nodo.arguments
      const specifier = literalDe(argumento)
      if (specifier !== null) anotar(nodo, specifier)
    }
    ts.forEachChild(nodo, (hijo) => recorrer(hijo, dentroDeTipo))
  }
  recorrer(fuente, false)
  return encontradas
}
