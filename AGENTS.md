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

Qué archivos entran al review del gate (el hook `pre-commit` local y el job `review` de CI).

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
- `pnpm dist:lint` recorre los `.js` del build de la app (`apps/app/dist`) y
  falla si alguno deja un import que el navegador no pueda resolver
  (`import"@netatlas/data"`, `from"node:sqlite"`…): un specifier desnudo deja la
  app en blanco y los E2E caen por timeout hasta agotar el presupuesto del job.
  Necesita el build hecho, así que no entra en el trío obligatorio: lo corren
  los jobs de CI que compilan la app.
- El mismo `pnpm modules:lint` recorre los proyectos que declara
  `pnpm-workspace.yaml` (más la raíz) y falla si dos comparten `name`: un nombre
  duplicado deja `pnpm --filter <nombre>` ambiguo y la tarea se ejecuta en el
  proyecto equivocado o muere por un binario que ese proyecto no declara.
- El mismo `pnpm modules:lint` falla si una **dependencia interna** del
  workspace no se declara `workspace:*` (`workspace:^`, `^0.0.0`, `file:…`,
  `link:…`): con un rango, pnpm la resuelve fuera del repo. Mira las cuatro
  secciones del manifiesto y saca la lista de proyectos de
  `pnpm-workspace.yaml`, así que un proyecto nuevo entra en la regla por existir
  — el estándar ya no depende de un grep a mano.
- El mismo `pnpm modules:lint` falla si un módulo de `apps/app/src` importa el
  barrel de `@netatlas/application` **en runtime**: el barrel reexporta el caso
  de importación por lote y arrastra `@netatlas/importers` → `@netatlas/data`,
  que el build del navegador deja `external`. Los `import type` / `export type`
  no cuentan —el compilado los borra enteros—, así que la regla caza la causa
  en estático, sin compilar y sin falsos positivos.
- El mismo `pnpm modules:lint` falla si el bundle del navegador alcanza un
  builtin de Node (`node:sqlite`, `node:fs`…): recorre los **imports de valor**
  desde los módulos de `apps/app/src` —los de tipo no cuentan, el compilado los
  borra— y señala el módulo que lo importa con el camino por el que entró. El
  caso que define la frontera: `@netatlas/server` no puede entrar al bundle (el
  barrel reexporta `sqlite-store` → `node:sqlite`), pero la subruta
  `@netatlas/server/sync-http` sí —es transporte sobre `fetch`—, y es la puerta
  por la que la app cruza. Lo que la app alcanza a propósito y solo corre
  donde hay Node se declara como puerta en `PUERTAS_NODE`, con el motivo: la
  composición SQLite del escritorio es la de hoy.

### Workflows y configuración de CI

Los ficheros que deciden si el resto pasa —`.github/workflows/*.yml`,
`package.json`, `tsconfig*.json`, `.npmrc`— se juzgan como código, no como
trámite. Lo generado sigue fuera: `pnpm-lock.yaml` y los JSON del dataset son
contenido.

**Workflows**

- **Todo job lleva `timeout-minutes`.** Sin presupuesto, un cuelgue se lleva
  el runner hasta su tope y muere cancelado sin decir qué fallaba. Hoy: 20 en
  `verify`, 15 en `ui`, 20 en `review`, 30 en `e2e`, 40 en `tauri`, 45 en
  `release`.
- **El límite que decide va dentro de la corrida, no solo en el job.** El
  `timeout-minutes` es la última red; el tope real lo pone el runner de
  pruebas (`--global-timeout=900000` y `--max-failures=1` en Playwright), para
  que un cuelgue acabe en FAILED con informe y en un minuto, no en media hora.
- **Instalación canónica, siempre la misma**: `actions/checkout@v4` →
  `pnpm/action-setup@v4` con la versión de `packageManager` →
  `actions/setup-node@v4` (Node 22, `cache: pnpm`) → `pnpm install
  --frozen-lockfile`. En CI el lockfile no se actualiza: un `pnpm install` sin
  `--frozen-lockfile` es un hallazgo.
- **Las actions se referencian por versión, no por rama** (`@v4`, `@v0`): una
  action apuntada a `main` cambia bajo los pies del build.
- **Los pasos que invocan un binario del paquete (`exec`) seleccionan por
  ruta** (`pnpm --filter ./apps/app exec playwright test`); los que corren un
  script van por nombre (`pnpm --filter @netatlas/app typecheck`). La ruta no
  depende de cómo se llame el paquete: cuando dos compartían nombre,
  `--filter` resolvía en ambos y el job de Tauri moría con «Command "tauri"
  not found».
- **El workflow invoca la receta, no la reescribe**: `pnpm typecheck`, `pnpm
  test`, `pnpm modules:lint`, `pnpm dist:lint`, `pnpm data:lint` y `pnpm
  bench` salen de los scripts de la raíz (los `--filter` por paquete y los
  `exec` con flags son la excepción). Un comando nuevo se define ahí una vez.
- **Lo barato primero, y donde se ve**: los lints de segundos van antes que
  los tests de minutos en el mismo job, y la comprobación del bundle corre
  también en el job que compila, no solo en el de E2E.
- **Un job que compila comprueba el artefacto** con un paso explícito (`test
  -f apps/app/dist/sw.js`, `Test-Path …netatlas-desktop.exe`): el exit 0 del
  build no prueba que el fichero exista.
- **Los jobs no comparten workspace**: si un test necesita un artefacto
  generado (`netatlas-seed.sqlite`), el job lo construye antes
  (`dataset:build`). No se asume lo que hizo otro job.
- **Publicar es un workflow aparte** (`release.yml`), con `permissions`
  explícito y mínimo (`contents: write`) y `releaseDraft: true`: la release se
  revisa antes de publicarse. Un workflow que solo verifica no pide permisos
  de escritura.
- **El gate de review corre también en CI** (`review.yml`, solo en
  `pull_request`, sobre el diff del PR): el hook vive en `.git/hooks/` de cada
  clon, así que un clon sin instalarlo —o un commit con `--no-verify`— llegaba a
  main sin que nadie lo mirara. El job no instala el proyecto (no compila ni
  testea: eso es `ci.yml`), solo clona GGA en la misma versión del hook, le da
  el diff del PR y deja que decida. La credencial del proveedor va en un secreto
  (`CODEX_API_KEY` u `OPENAI_API_KEY`): sin ella el job **falla**, no se salta el
  review en silencio; la única excepción es un PR desde un fork, donde los
  secretos no llegan y el job avisa y se omite.
- **`fail-fast: false`** en una matriz donde cada plataforma debe reportar su
  resultado: un SO que falla no puede ocultar el estado del otro.
- **Un presupuesto o un flag no obvio se justifica al lado**, con la medición
  que lo respalda («medido en #11–#16: ~10m30s por intento»). El workflow es
  donde el siguiente lee el porqué.

**`package.json`**

- **Todo proyecto del workspace es privado y de la casa**: `private: true`,
  `type: module`, `version: 0.0.0` y nombre `@netatlas/<kebab>` (la raíz,
  `netatlas`).
- **Las dependencias internas se declaran `workspace:*`**, nunca con un rango
  escrito a mano.
- **Los scripts de la casa se llaman igual en todos los proyectos**:
  `typecheck` (`tsc --noEmit`) no falta en ninguno; `lint`, cuando existe, es
  exactamente `tsc --noEmit` —no hay ESLint ni Prettier—; `test` es `vitest
  run`; un paquete que emite declara `build`. Un `lint` que haga otra cosa es
  un hallazgo.
- **En la raíz esos mismos nombres delegan** (`typecheck`, `lint`, `test` y
  `build` son `pnpm -r run …`), y los comandos de la casa se exponen ahí
  (`modules:lint`, `dist:lint`, `data:lint`, `bench`, `migrate`, `import`)
  delegando con `pnpm --filter`: el workflow y quien commitea llaman al mismo
  nombre.
- **`engines.node` y `packageManager` viven en la raíz** y fijan la versión de
  CI y de local: el workflow no elige Node ni pnpm por su cuenta.
- **Un script no depende del cwd**: si necesita la raíz del repo, la deriva de
  su propia ruta (`tools/repo-lint` lo hace), no de `process.cwd()`.

**`tsconfig*.json`**

- **Todo tsconfig de proyecto extiende `tsconfig.base.json`.** Los flags de
  strictness viven ahí y **no se re-declaran ni se relajan** en el paquete:
  re-declararlos es cómo se pierde uno sin que nadie lo note.
- **Lo propio del paquete es lo suyo**, no la rigurosidad: `lib`, `jsx`,
  `types`, `outDir` (y `moduleResolution`, que el base ya trae en `Bundler`).
- **`tsconfig.build.json` para lo que se emite**: extiende el `tsconfig.json`
  del paquete y añade `noEmit: false`, `declaration`, `declarationMap`,
  `sourceMap`, `outDir: dist` e `include: ["src"]` —los tests no se emiten.
- **`include` declara lo que el lint revisa** (`src`, más `test` y
  `vitest.config.ts` cuando existen).

**`.npmrc` y `pnpm-workspace.yaml`**

- **`.npmrc` es política, no preferencia**: `auto-install-peers=true`,
  `strict-peer-dependencies=false` e `ignore-scripts=true`. Con los scripts de
  instalación apagados, un `postinstall` que hiciera falta tendría que
  declararse a la vista.
- **`pnpm-workspace.yaml` es la lista canónica de proyectos** (`packages/*`,
  `apps/*`, `tools/*`, `datasets/*`). Las reglas que enumeran proyectos la
  leen de ahí en vez de mantener una copia; un directorio nuevo de primer
  nivel se añade aquí y lo ven todas.

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
