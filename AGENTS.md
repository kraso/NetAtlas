## Review output contract (GGA)

El hook `pre-commit` ejecuta GGA con `STRICT_MODE="true"`: exige que la respuesta
del review contenga exactamente una línea `STATUS: PASSED` o `STATUS: FAILED` al
inicio de línea. Si no la encuentra —o si encuentra las dos— el commit se bloquea
aunque el código esté bien.

- El veredicto va **en su propia línea**, con el prefijo exacto `STATUS: ` y el
  valor `PASSED` o `FAILED`.
- Se escribe **una sola vez**, como primera línea del review. No hay borradores
  de veredicto, ni un segundo veredicto al final, ni la palabra `STATUS` en
  ninguna otra línea del texto (tampoco citando este contrato): dos líneas con
  veredictos distintos dejan el review ambiguo y bloquean el commit.
- El review juzga **el contenido entregado**, sin ejecutar los comandos del
  proyecto ni inspeccionar el repositorio: `pnpm lint`, `pnpm typecheck` y
  `pnpm test` los corre quien commitea, no el reviewer. No poder ejecutarlos no
  es motivo de `FAILED`; solo lo es una violación confirmada de los estándares.
- Sin veredicto posible → `STATUS: FAILED`, y el motivo después.
- Los hallazgos van después del veredicto, con archivo, línea, regla violada y
  evidencia. Solo son hallazgos las **violaciones confirmadas**: una observación
  que el propio review califique como «no violación», «arguable» o «aunque
  cumple» no cuenta. Sin violaciones confirmadas → `STATUS: PASSED`.
- GGA escanea el transcript completo, tool calls incluidos, así que el veredicto
  puede ir al final del análisis. Lo que no puede es faltar, ni aparecer dos
  veces con valores distintos.

## Alcance del gate

Qué archivos entran al review del hook `pre-commit`.

- El gate revisa también los **archivos de test**: `*.test.ts`, `*.test.tsx`,
  `*.spec.ts`, `*.spec.tsx` y `apps/app/e2e/*.spec.ts`. Son la red que valida
  casi todos los movimientos del repositorio y antes quedaban fuera del gate.
- El gate revisa también los **workflows y la configuración de CI**
  (`*.yml`, `*.yaml`, `package.json`, `tsconfig*.json`, `.npmrc`): son los
  ficheros que deciden si el resto pasa —jobs, presupuestos, rutas, scripts— y
  se commiteaban sin que nadie los mirara. Lo generado sigue fuera:
  `pnpm-lock.yaml` (excluido por nombre aunque `*.yaml` esté dentro) y los JSON
  del dataset (`datasets/**`), que son contenido, no configuración.
- Quedan fuera los **fixtures** (`*-fixtures.ts`, `*.fixtures.ts`,
  `*-fixture.ts`, `*.fixture.ts`, `fixtures/`, `__fixtures__/`) y los
  **snapshots** (`*.snap`, `__snapshots__/`): son material de apoyo de los
  tests, no código de test. También siguen fuera los `*.d.ts` generados.
- Se configura en el `.gga`, que **se versiona** con el repositorio
  (`FILE_PATTERNS` / `EXCLUDE_PATTERNS`): cada clon hereda la misma cobertura
  sin configurar nada. Al tocarlo, ojo con el matching de GGA: un patrón que empieza
  por `*` se compara como **sufijo literal** sobre la ruta completa (no como
  «contiene»), así que los directorios se cubren con un glob que empiece por
  `?` (`?*fixtures/*`) y no con `*fixtures*`.

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
- El límite de 200 líneas de los módulos está automatizado:
  `pnpm modules:lint` falla si algún módulo de `src` lo supera (los barrels
  exentos del punto siguiente quedan fuera del recuento).
- El mismo `pnpm modules:lint` recorre los proyectos que declara
  `pnpm-workspace.yaml` (más la raíz) y falla si dos comparten `name`: un nombre
  duplicado deja `pnpm --filter <nombre>` ambiguo y la tarea se ejecuta en el
  proyecto equivocado o muere por un binario que ese proyecto no declara.

### Convenciones

- **Módulos de menos de 200 líneas.** Si excede, dividir. **Excepción:** los
  barrels (`index.ts` cuyo único contenido son re-exports) no están sujetos al
  límite: su tamaño es la superficie pública del paquete, no lógica, y partirlos
  agrega indirección sin beneficio. Un barrel al que se le agregue cualquier
  cosa que no sea `export` deja de estar exento. Los **ficheros de test**
  (`*.test.ts`, `*.spec.tsx`, `apps/app/e2e/*.spec.ts`) tampoco entran en el
  recuento: `modules:lint` los omite y su tamaño se juzga por el suite, no por
  el límite de la lógica de `src`.
- **Funciones de menos de 30 líneas, una sola responsabilidad.** Aplica a la
  lógica: hooks (`use*`), manejadores de eventos, carga de datos y
  transformaciones. El cuerpo JSX de un componente no se mide con esta regla
  —los componentes se juzgan por el límite de módulo—, pero su lógica debe
  vivir en hooks o utilidades que sí la cumplen. **El cuerpo de un caso de test
  (`it`/`test`) tampoco se mide**: su responsabilidad es el caso que nombra el
  título, y su cuerpo es la secuencia arrange/act/assert que se lee de corrido;
  un caso que no cabe en una lectura razonable son dos casos, no una función
  extraída. La regla sí aplica dentro de los tests a lo que es lógica como
  cualquier otra: **fábricas y dobles, helpers de espera, utilidades de
  aserción y hooks de prueba** (`use*`).
- **Nomenclatura**: `camelCase` para variables y funciones, `PascalCase` para
  tipos y clases, `snake_case` para columnas SQL.
- **Imports**: se cuentan las declaraciones `import`, no los símbolos que
  traen. Si un archivo supera 5 declaraciones, reestructurar dependencias
  (barrel `*-piezas.ts` cuando el barrel simplifique el grafo).
- **Error handling explícito, nunca silencioso.** Un dato inválido rompe fuerte
  y temprano (es el criterio de los constructores de VOs del dominio).
  «Explícito» significa: propagar el fallo **o** registrarlo (`console.warn`/
  `console.error` con contexto) y, si es operación de cara al usuario,
  comunicarlo en la UI. Registrar una operación secundaria declarada
  best-effort —auditoría, persistencia de layout— es cumplimiento suficiente:
  no hay que convertir ese fallo en un estado de error del llamador.
- **Comentarios de dominio en español**, convención del repositorio.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
