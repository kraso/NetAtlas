## Review output contract (GGA)

El hook `pre-commit` ejecuta GGA con `STRICT_MODE="true"`: exige que la respuesta
del review contenga exactamente una línea `STATUS: PASSED` o `STATUS: FAILED` al
inicio de línea. Si no la encuentra —o si encuentra las dos— el commit se bloquea
aunque el código esté bien.

- El veredicto va **en su propia línea**, con el prefijo exacto `STATUS: ` y el
  valor `PASSED` o `FAILED`.
- Sin veredicto posible → `STATUS: FAILED`, y el motivo después.
- Los hallazgos van después del veredicto, con archivo, línea, regla violada y
  evidencia.
- GGA escanea el transcript completo, tool calls incluidos, así que el veredicto
  puede ir al final del análisis. Lo que no puede es faltar, ni aparecer dos
  veces con valores distintos.

## Estándares de código

Lo que un review de este repositorio debe juzgar. Es la lista aplicable hoy.

### Verificable por herramienta

- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
  `noUncheckedIndexedAccess` implica que el acceso por índice —incluido
  `SqlRow`— puede ser `undefined`: un chequeo de nulidad que solo cubre `null`
  no alcanza.
- **`lint` de cada paquete es `tsc --noEmit`.** No hay ESLint ni Prettier: el
  compilador es el linter.
- **Comandos obligatorios antes de commitear**: `pnpm lint`, `pnpm typecheck`,
  `pnpm test`. Si se tocó el dataset: además `pnpm data:lint`.

### Convenciones

- **Módulos de menos de 200 líneas.** Si excede, dividir. **Excepción:** los
  barrels (`index.ts` cuyo único contenido son re-exports) no están sujetos al
  límite: su tamaño es la superficie pública del paquete, no lógica, y partirlos
  agrega indirección sin beneficio. Un barrel al que se le agregue cualquier
  cosa que no sea `export` deja de estar exento.
- **Funciones de menos de 30 líneas, una sola responsabilidad.** Aplica a la
  lógica: hooks (`use*`), manejadores de eventos, carga de datos y
  transformaciones. El cuerpo JSX de un componente no se mide con esta regla
  —los componentes se juzgan por el límite de módulo—, pero su lógica debe
  vivir en hooks o utilidades que sí la cumplen.
- **Nomenclatura**: `camelCase` para variables y funciones, `PascalCase` para
  tipos y clases, `snake_case` para columnas SQL.
- **Imports**: se cuentan las declaraciones `import`, no los símbolos que
  traen. Si un archivo supera 5 declaraciones, reestructurar dependencias
  (barrel `*-piezas.ts` cuando el barrel simplifique el grafo).
- **Error handling explícito, nunca silencioso.** Un dato inválido rompe fuerte
  y temprano (es el criterio de los constructores de VOs del dominio).
- **Comentarios de dominio en español**, convención del repositorio.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
