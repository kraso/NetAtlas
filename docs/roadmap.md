# Roadmap — NetAtlas

> Fuente normativa: PLAN MAESTRO §27. Estado: **todas las fases cerradas — F8B (web pública y API) implementada**. Plan maestro completo ✅

## Fases

| Fase | Nombre | Contenido | Criterio de salida | Estado |
|---|---|---|---|---|
| **F0** | Investigación y arquitectura | Plan; spikes SQLite+FTS5; prototipo de esquema; 20 fichas piloto | ADRs firmados; búsqueda <50 ms p95 sobre 10k sintéticos | ✅ **cerrada** |
| **F1** | MVP | Catálogo + fichas + búsqueda FTS/DSL + vista OSI + fuentes v1 + importación JSON/CSV + seed 300–500 | Criterios 28.1.6 (los 6) | ✅ **cerrada** |
| **F2** | Catálogo avanzado | Calculadoras, exploradores de catálogos, autocompletado, fabricantes, glosario, panel frontal, migas | 15 macrocategorías pobladas; cobertura fuentes ≥80% | ✅ **cerrada** |
| **F3** | Relaciones y búsqueda avanzada | Grafo completo, facetas dinámicas, mapa local, genealogía básica | Navegación ≤2 clics verificada en E2E | ✅ **cerrada** |
| **F4** | Diagramas interactivos | Mapa global, visor de topologías, panel frontal generado, flujo de paquetes, exportación SVG/PNG | SLOs de diagramas (23.2) cumplidos | ✅ **cerrada** |
| **F5** | Comparador | Motor + UI + veredicto + exportación | CU-02 aprobado | ✅ **cerrada** |
| **F6** | Estándares/protocolos/importación pro | Exploradores completos, dedup/reconciliación, calidad de fuentes | Lote externo sin SQL a mano | ✅ **cerrada** |
| **F7** | IA | RAG + asistente + generación de topologías + eval | 0 alucinaciones de specs | ✅ **cerrada** |
| **F8A** | Sincronización | Servidor + adaptador PostgreSQL + réplica offline + contribuciones | App funciona offline y sincroniza al recuperar red | ✅ **cerrada** |
| **F8B** | Web pública y API | Despliegue público, API REST documentada (OpenAPI), auth, perfiles | Terceros consumen la API con clave | ✅ **cerrada** |

## Estado de la Fase 0 (✅ cerrada)

- [x] Monorepo pnpm + paquetes (`packages/`) + herramientas (`tools/`)
- [x] Esquema inicial `0001_init.sql`; dominio puro + VO + puertos
- [x] FTS5 + facetas; `data:lint`; `dataset:build`; benchmark **p95 ≈ 2 ms** (10k)
- [x] ADRs 0001–0008; docs vivos; CI GitHub Actions

## Estado de la Fase 1 (núcleo; UI React pendiente)

### Implementado (cierra criterios 28.1.6 #1, #2, #5, #6)

- [x] **DSL completo** (NET-HW-012): parser →AST con errores explicados y sugerencias — `packages/domain/src/search/parser.ts` (19 tests)
- [x] **Compilador AST→SQL parametrizado** (NET-HW-013) con semántica §12.3 (cat con CTE de árbol+aliases, protocolo AND/OR, capa sobre osi_profile, velocidad Gbps→Mbps, poe, medio, estado, año) — `packages/search/src/dsl-compiler.ts`
- [x] **Las 7 consultas canónicas como tests permanentes** (criterio 28.1.6#1) en <500 ms — `packages/search/test/canonical-7.test.ts`
- [x] **Repositorios SQLite sobre puertos** (NET-HW-003): `SqliteDeviceRepository` (por slug/ids/categoría con CTE de árbol/manufacturer, paginación por cursor), `SqliteGraphRepository` (vecindad BFS + caminos acíclicos, aristas inversas `succeeds`↔`precedes`), `SqliteCatalogRepository`
- [x] **composition-root** (NET-HW-004): DI por runtime (test/CLI/desktop) en `packages/data/src/composition-root.ts`
- [x] **Catálogos master** (NET-HW-005/006): 118 protocolos · 101 estándares · 31 medios · 39 fabricantes · 26 categorías (niveles 2–3)
- [x] **Seed ampliado** (NET-HW-007, parcial): 31 fichas de dispositivos reales (20 curadas + 11 icónicos con confidence third-party y nota de validación F2); **cobertura de fuentes 100%** (criterio 28.1.6#2)
- [x] **Pipeline de importación** (NET-HW-043): parse JSON/CSV → normaliza → valida → dedup → reconcilia → persiste transaccional; **criterio 28.1.6#5** (lote con 5% corruptos → rechazo con razón exacta, resto intacto) como test
- [x] **Property-based tests** (NET-HW-054) con fast-check sobre normalizar/validar
- [x] `data:lint` ampliado: catálogos cerrados (8.6-1), cobertura de fuentes, replaced-by⇒EoL

### UI implementada (NET-HW-017…021, 026 — 🎨 bloque UI completo)

- [x] **Design system** (NET-HW-017): tokens CSS (tema oscuro primero + claro, contraste AA), badges de confianza por nivel (§20.3), iconografía SVG por macrocategoría — `packages/ui`
- [x] **`apps/app` React + Vite + TS**: routing, Zustand stores (MVVM viewmodels), composition-root
- [x] **Dashboard** (NET-HW-018): búsqueda dominante + tarjetas por macrocategoría + estadísticas
- [x] **Explorador** (NET-HW-019): árbol jerárquico + faceta de categoría + resultados en tabla accesible
- [x] **Ficha** (NET-HW-020): 4 pestañas núcleo (Resumen/Especificaciones/Interfaces/Capas OSI) + badges de fuente; las 13 completas en refinamiento
- [x] **Panel OSI/TCP-IP** (NET-HW-021): panel vertical 7 capas + TCP/IP derivado + **consulta inversa por capas**
- [x] **A11y AA base** (NET-HW-026): labels asociados, tabs con roles/aria, foco visible, `prefers-reduced-motion`, navegación por teclado probada
- [x] **Adaptador in-memory** de los puertos del dominio para navegador/tests (wa-sqlite en F1-late, mismo contrato)
- [x] Build de producción Vite verde; CI con job `ui` (typecheck + tests + build)

### Plataforma y calidad (✅ cerradas)

- [x] **PWA offline** (NET-HW-051): manifest.webmanifest con icons 192/512 (+maskable) generados con script PNG sin dependencias; Service Worker (workbox generateSW) con precache de 12 entradas y `navigateFallback` SPA; **modo avión verificado por E2E** (navegación sin red tras primera carga) — criterio 28.1.6#4 (vertiente web)
- [x] **Tauri** (NET-HW-052): `apps/app/src-tauri` (Cargo.toml, tauri.conf.json con identifier/updater configurado, comandos FS `inspect_dataset`/`read_asset_bytes`, capabilities) — **build release verificado localmente** (`netatlas-desktop.exe`)
- [x] **E2E Playwright** (NET-HW-053): flujo crítico 28.1.6#3 (buscar→explorar→ficha→capas→dispositivos relacionados) + 404 contextual, en **chromium y firefox**; CI con job `e2e`
- [x] CI ampliado: jobs `verify` (núcleo), `ui` (PWA build+SW verificado), `e2e`, `tauri` (Windows + Rust toolchain)

### Contenido y motor real (✅ cerradas — F1 completa)

- [x] **Seed 330 dispositivos** (NET-HW-007): 31 curados + 299 generados por **importación asistida** (`tools/dataset-tools/src/assisted-gen.ts`) — solo datos estructurales reales (fabricante, categoría, puertos típicos por familia, protocolos/medios de familia, perfil OSI); **sin especificaciones numéricas inventadas** (throughput/mpps omitidos, pendientes de datasheet en F2); assertions `third-party` con fuente `netatlas-assist` + nota "validar en F2"; `data:lint` verde con cobertura de fuentes 100%
- [x] **import-cli** (NET-HW-043 como herramienta): `tools/import-cli` — CSV/JSON → pipeline del dominio → informe de lote (altas/actualizaciones/rechazos con razón) sobre el driver real
- [x] **Ficha de 13 pestañas** (§10.5): Resumen · Especificaciones · Interfaces · Protocolos · Capacidades · Arquitectura · Capas OSI · Estándares · Compatibilidad · Diagramas · Historia · Documentación · Referencias — alimentadas por GraphRepository/edgesOf + SourcingRepository/assertions; empty-states curados donde el modelo aún no tiene datos
- [x] **Bidireccionalidad** (§10.7): ficha de protocolo `/protocolo/:code` lista los dispositivos que lo soportan
- [x] **Motor SQLite real en la UI** (Fase C): `composition-root-sqlite.ts` (NodeSqliteDriver + SqliteDeviceRepository/GraphRepository/SourcingRepository + Fts5SearchIndex sobre `netatlas-seed.sqlite` de 330 dispositivos) — mismo contrato de puertos que el in-memory; wa-sqlite es el mismo contrato para el navegador (F1-late); tests de integración UI-SQLite verdes
- [x] Nuevo puerto `SourcingRepository` (dominio) + `SqliteSourcingRepository` (data) — trazabilidad de assertions por slug

### F1 — MVP completo ✅

- [x] Criterios 28.1.6 #1 (7 canónicas <500 ms), #2 (cobertura ≥80%), #3 (E2E flujo crítico), #4 (offline PWA), #5 (lote con rechazo razonado), #6 (data:lint verde)

## Estado de la Fase 2 (implementada — ítems B del backlog)

- [x] **Calculadoras** (NET-HW-028): PoE (clases 802.3af/at/bt, presupuesto, maxPoePorts) · enlace óptico (presupuesto dB, **caso CU-14: 10 km SMF → LR 1310 nm viable**) · subnetting (CIDR + VLSM greedy) · conversores (velocidad, datos, dBm↔mW, ratio↔dB, distancia) — servicios puros en `packages/domain/calculators` (14 tests)
- [x] **Exploradores de catálogos** (NET-HW-023): `/catalogos` (protocolos/estándares/medios) + fichas bidireccionales (dispositivos que los usan) + calculadora de enlace anclada en el medio (4 tests)
- [x] **Autocompletado agrupado + búsquedas guardadas** (NET-HW-014): sugerencias por tipo (Dispositivos/Protocolos/Estándares/Medios/Categorías/Fabricantes) + persistencia localStorage (4 tests)
- [x] **Páginas de fabricante** (NET-HW-027): `/fabricante/:slug` → familias → modelos
- [x] **Panel frontal SVG** (NET-HW-022): render del inventario de puertos por grupo, con colores por velocidad/PoE y equivalencia textual accesible
- [x] **Glosario + enlaces inline** (NET-HW-024): `/glosario` con filtro + términos (conmutador, dominio de colisión, VLAN, PoE, transceptor, enlace troncal) enlazados desde las pestañas de las fichas
- [x] **Panel contextual derecho + migas + historial** (NET-HW-025): `aside` sticky con panel frontal/soportes/estándares/glosario + `Breadcrumbs` (`/` _ `/explore` _ ficha) + botón volver por historial de sesión
- [x] nuevo nav "Catálogos" en la cabecera

### Pendiente F2 (refinamiento)

- [ ] audit. accesibilidad continua axe en CI (NET-HW-058)

## Estado de la Fase 3 (implementada — grafo y relaciones)

- [x] **Vecindad y caminos acotados por CTE** (NET-HW-029): `vecindadCte` con `WITH RECURSIVE alcanzable` (≤N saltos con dedupe) sobre el mismo tipo de entidad, además de la BFS-JS `neighbors`/`paths` (3 tests nuevos sobre el repositorio SQLite)
- [x] **EAV operativo** (§9.4, arrastrado de F2): `SqliteAttributesRepository` async (definiciones heredadas por ancestros CTE, valores por dispositivo, `facetCounts` por subárbol, `filterByFacetValues` AND/OR) + contrato `UiAttributesRepo` compartido in-memory/SQLite — sin acoplar vistas al motor
- [x] **Facetas dinámicas en el explorador**: panel «Filtros dinámicos» por atributo facetado (conteos por valor) que acota los resultados al vuelo (data deriva del seed: 10 definiciones / 52 valores curados)
- [x] **Capacidades en la ficha**: pestaña con tabla Atributo/Valor/Unidad desde EAV + métricas de assertions (throughput/consumo) como respaldo
- [x] **Mapa de relaciones local** (NET-HW-030): pestaña Diagramas con Cytoscape.js (vecindad ≤2 saltos, colores por tipo de nodo, aristas etiquetadas con predicado) + filtros por predicado con conteos; mock de cytoscape para jsdom
- [x] **Genealogía evolves-into + árbol tecnológico** (NET-HW-031): pestaña Historia — árbol evolutivo de dispositivos (antecesores/sucesores a profundidad 8) + cadenas de evolución de tecnologías (PoE 802.3af→at→bt demostrado en el demo)
- [x] **similar-to + «comparar desde aquí»** (NET-HW-032): lista de similares curados en Compatibilidad con puente a la nueva ruta `/comparar` (fija contendientes a/b; comparativa completa con reglas compareRule en F5)
- [x] **Criterio O3/F3 — navegación ≤2 clics verificada en E2E**: dispositivo→protocolo (1 clic), dispositivo→antecesor (2), dispositivo→similar (2), explorador→ficha→protocolo (2); spec Playwright nuevo en chromium y firefox

### Pendiente F3 (refinamiento)

- [ ] mapa global del conocimiento con agregación (NET-HW-036, F4)
- [ ] exportación SVG/PNG de vistas (NET-HW-037, F4)

## Estado de la Fase 4 (implementada — diagramas interactivos)

- [x] **Módulo de topologías en el dominio** (§13.3): `Topology`/`TopologyNode`/`TopologyEdge` con invariantes del agregado (ids únicos, aristas a nodos existentes, sin bucles de un solo nodo) y `withLayout` inmutable; puerto `TopologyRepository` (list/bySlug/upsert/saveLayout/remove) + `validateLinkCompatibility` (interfaz común por velocidad o compatibilidad curada)
- [x] **Adaptador SQLite** (`SqliteTopologyRepository`): roundtrip completo de topologías con traducción entity-slug ↔ id (como relationship), persistencia de layout solo de coordenadas y remove transaccional (4 tests)
- [x] **Siembra de topologías de referencia** en `dataset:build`: `clos-3-etapas` (7 nodos/8 aristas), `sucursal-tipica` (4/3) y `demostracion-300` (300 nodos/311 aristas para el SLO) sobre dispositivos reales del seed
- [x] **NET-HW-033 Visor de topologías**: `/topologies` + `/topology/:slug` con Cytoscape — posiciones persistidas al arrastrar (`saveLayout`), «Reordenar automáticamente», filtros por capa OSI, click→ficha, alternativa accesible en tabla
- [x] **NET-HW-034 Laboratorio-editor**: crear topologías de usuario (persistidas en localStorage), añadir/quitar dispositivos por slug, conectar con **validación de compatibilidad** (mensaje concreto al rechazo)
- [x] **NET-HW-035 Flujo de paquetes animado**: ruta BFS no dirigida entre dos nodos tocados y resaltado por saltos (.enRuta en Cytoscape)
- [x] **NET-HW-036 Mapa global del conocimiento**: agregación por categoría (nodos con conteo, aristas device↔device entre categorías) en in-memory y SQLite; click→explorador; tabla accesible
- [x] **NET-HW-037 Exportación SVG/PNG**: botones en el visor (cytoscape PNG + extensión cytoscape-svg), con pie descargable por nombre de topología y fecha
- [x] **SLO de diagramas (§23.2) verificado en E2E**: `slo-diagramas.spec.ts` mide el primer render real de Cytoscape (evento `render`) en `estres-300` — **chromium 216 ms y firefox 384 ms, ambos < 500 ms**
- [x] E2E de flujo completo de topologías en chromium y firefox (visor+filtros+exportación, laboratorio con validación y persistencia tras recarga, mapa global): 24/24 verdes

### Pendiente F4 (refinamiento)

- [ ] virtualización >1.500 nodos (agregación por categoría) y modo Canvas >5.000 (ADR-03)
- [ ] layouts en Web Worker y persistencia de «reordenar» como layout de usuario

**✅ Deuda técnica resuelta — bundle de Cytoscape**: import dinámico de las rutas de diagramas (`/topology/:slug`, `/mapa-global`, pestaña Diagramas con `React.lazy` + `Suspense`) + `manualChunks` (`cy-vendor` para cytoscape/cytoscape-svg y `react-vendor` para el runtime de React). Resultado: el chunk inicial de la app baja de **753,81 kB (240,66 gzip) a 268,31 kB (84,43 gzip)**; `cy-vendor` (464,82 kB / 149,47 gzip) solo se descarga/evalúa al abrir un diagrama (precacheado por el SW). **Sin warning de >500 kB**. SLO §23.2 re-verificado (<500 ms en chromium y firefox) y E2E de topologías/comparador **28/28** intactos.

## Estado de la Fase 5 (implementada — comparador, CU-02 aprobado)

- [x] **Motor de comparación 100% puro** (`packages/domain/src/compare/motor.ts`): `compareDevices` → `ComparisonReport` con unificación de filas (comunes primero), normalización numérica por tipo de atributo, reglas `higher-better`/`lower-better`/`set-compare`/`none` con insignias ▲/▼ y explicación de limitación ("176 Gbps frente a 256 Gbps"), detección de diferencias (modo solo-diferencias), compatibilidades curadas (`compatible-with`), veredicto por plantilla determinista sin IA y aviso de comparación transversal (§18.4) con lista de atributos específicos (11 tests)
- [x] **NET-HW-041 Reglas declarativas de (in)compatibilidad** en el dominio: sin interfaz común (velocidades), SMF vs MMF, PoE requerido > presupuesto; la UI las combina con la arista curada por par (4 tests)
- [x] **NET-HW-040 UI del comparador N columnas** (`/comparar`): selección 2–N por querystring `ids=` (retrocompatible a/b) y **desde el explorador** (casillas + «Comparar seleccionados»), tabla por atributos con filas plegables, modo «Solo diferencias» con contador, resaltado ▲ mejor valor, panel de veredicto, aviso transversal, añadir/eliminar candidatos con buscador
- [x] **NET-HW-042 Exportación CSV** (descargable real) **y PDF vía imprimir del navegador** (diálogo nativo, documentado; pendiente jsPDF si se quiere PDF descargable directo)
- [x] **CU-02 aprobado en E2E** (chromium y firefox): explorador `cat:sw` → marca 3 switches → comparador → aviso transversal → veredicto con diferencias reales del seed (PoE 0 frente a 48; específicos: PoE/stacking/capacidad) → modo solo-diferencias oculta la fila idéntica → exporta CSV. Suite E2E completa **28/28**
- [x] Demo ajustada: el 9300 de demostración sin PoE (8.2.5) para evidenciar diferencias reales en CU-02

### Pendiente F5 (refinamiento)

- [ ] PDF descargable directo (jsPDF/window.print con captura) si el flujo de impresión no basta
- [ ] URL compartible del reporte con veredicto persistido en la querystring (ya compartible por ids)

## Estado de la Fase 6 (implementada — importación pro, criterio F6 aprobado)

- [x] **NET-HW-045 Dedup con scoring + cola de reconciliación con diff**: dominio puro (`dedupScore`, `diffCampos`) con umbrales §19.2-4 — fusión automática solo ≥0.98, candidatos [0.7, 0.98) a revisión; migración `0002` con tabla `reconciliation` (+ `dataset_signature`); el pipeline importa existentes por (fabricante, modelo, sku), reescribe slugs en fusiones y deja los candidatos en la cola con diff lado a lado; `SqliteReconciliationRepository` (pendientes, resolver con autor). Esquema del dataset **v2**
- [x] **NET-HW-046 Importadores XML/YAML/API**: adaptadores con alias de campos ES/EN (`parseYaml` con `yaml`, `parseXml` con `fast-xml-parser`) conectados al mismo pipeline parse→normaliza→valida→dedup→reconcilia→persiste; `pnpm import --yaml=…|--xml=…` con informe legible (altas/actualizaciones/conflictos/rechazos + diff de los candidatos). La extracción asistida de datasheets se apoya en el flujo de revisión del dashboard (la parte LLM es F7)
- [x] **NET-HW-047 Dashboard de calidad** (`/calidad`): cobertura de fuentes global y por categoría, distribución de confianza, atributos EAV, dispositivos sin especificaciones, cola de reconciliación con **Aceptar/Rechazar firmados** y manifiesto del dataset (contrato `UiQualityRepo` in-memory y SQLite)
- [x] **NET-HW-048 Manifiesto firmado + actualización delta**: `dataset:build` genera `netatlas-seed.sqlite.manifest.json` (conteos + SHA-256 + firma Ed25519 con `NETATLAS_SIGN_PRIVATE_KEY`); `data:manifiesto` verifica integridad/firma/compatibilidad; `data:delta --from/--to` genera el diff y `--apply` lo aplica transaccional (altas/actualizaciones/borrados por slug); la app muestra el manifiesto en Calidad
- [x] **NET-HW-049 Flujo de revisión y publicación**: cola con resolución firmada por revisor en el dashboard; `import-cli` registra conflictos/fusiones y el informe de lote queda legible para el curador
- [x] **Criterio F6 — lote externo sin SQL a mano** (test de integración): YAML+XML mixtos importados por `ejecutarImportacion` sobre SQLite real → altas + fusión automática (score ≥0.98) + 2 conflictos en cola (0.825/0.817) con diff + 0 rechazos + BD y calidad verificadas sin tocar SQL
- [x] **Mitigación de OOM del entorno**: pools singleton de Vitest (data/app/importers), heap `NODE_OPTIONS=--max-old-space-size=2048`, `--workspace-concurrency=1` y `workers=1` en Playwright (el diagnóstico confirmó que no hay huérfanos ni falta de RAM física: el límite está en la cuota del contenedor cuando se lanzan muchos procesos)

## Estado de la Fase 7 (implementada — IA, criterio F7 aprobado)

- [x] **NET-HW-059 AssistantPort + herramientas de function-calling**: puerto `AssistantPort` en el dominio (§21.4, adaptador local/mock/cloud futuro) + catálogo `HERRAMIENTAS` (`search_catalog`, `get_device`, `compare_devices`, `find_compatible`, `build_topology`, `what_layers`, `successors`) con esquemas JSON; el cliente orquesta comprensión→herramientas→respuesta citada (`ia/`) — la IA es un cliente más de la capa de aplicación (11 tests dominio)
- [x] **NET-HW-060 RAG con citas obligatorias + conjunto de oro**: `responderConContexto` redacta SOLO desde el contexto recuperado; cada afirmación enlaza a entidad/fuente (assertion); guardarraíl de honestidad (`no-tengo-datos`); `construirConjuntoOroDesdeDataset` + `evaluarConjuntoOro` con oráculo SQLite que comprueba cada cita contra las tablas — **criterio F7: 0 alucinaciones y fidelidad de citas 100% ≥ 95% sobre el seed real (134 preguntas / 395 citas, deploy autorizado)**
- [x] **NET-HW-061 Generación de topologías por lenguaje natural**: `extraerRoles`/`parsearSpec`/`validarSpecJSON` → `generarTopologia` resuelve roles a dispositivos reales por categoría, valida enlaces con interfaz común y persiste vía repositorio (8 tests)
- [x] **NET-HW-016 Embeddings locales + ranking híbrido**: vector TF-IDF determinista sin dependencias pesadas (`IndiceVectorialTFIDF`, coseno) + `rankingHibrido` léxico+vectorial (6 tests); contrato `SearchIndex` opaco para sustituir por sqlite-vec+ONNX en el navegador sin tocar UI (ADR-06)
- [x] **UI del asistente** (`/asistente`): chat con citas enlazadas a fichas, transparencia de herramientas ejecutadas (`<details>`), respuesta honesta sin datos, **feature flag `ai.enabled` OFF por defecto** (§21.4 — la app funciona 100% sin IA; panel "IA desactivada" con botón de activación). Adaptador in-memory (demo) + SQLite real (`SqliteToolContext`); reúso del índice FTS5 de la UI
- [x] **CLI `data:ia`**: `pnpm data:ia "pregunta"` (respuesta con citas sobre el seed) y `pnpm data:ia --eval [--max=N]` (eval con umbral §21.3: despliegue solo si fidelidad ≥95% y 0 alucinaciones)
- [x] **Verificación**: 131 tests de dominio + 82 de app (incl. eval F7 e integración UI) + **E2E 40/40** en chromium y firefox (asistente: flag off, chat con citas, honestidad, topología); `docs/ai.md` documenta arquitectura, guardarraíles y evaluación

### Pendiente F7 (refinamiento)

- [ ] embeddings ONNX/sqlite-vec en el navegador (la implementación TF-IDF local ya está detrás del mismo contrato `SearchIndex`)
- [ ] proveedor LLM cloud opcional tras el flag (la etapa de comprensión es sustituible manteniendo el puerto)

## Estado de la Fase 8A (implementada — sincronización, criterio offline+sync aprobado)

- [x] **NET-HW-062 Servidor + adaptador PostgreSQL + API REST + auth OIDC**: nuevo paquete `@netatlas/server` con API REST sobre `node:http` (sin dependencias): `GET /api/health`, `GET /api/device/:slug`, `GET /api/search`, `GET /api/categories`, `GET /api/snapshot?since=N`, `POST /api/contributions` (auth). **Auth OIDC real**: verificación JWT RS256 contra JWKS remoto con `node:crypto` (exp/iat/aud/iss, sin librerías) + Bearer estático para despliegues de un solo admin. **Adaptador PostgreSQL** (`PostgresServidorStore`) con el MISMO contrato `ServidorStore` que el SQLite (`SqliteServidorStore` sobre el runtime real) — §6.7: cambiar de motor no toca dominio ni vistas (prueba ácida verificada en test con driver doble; conexión real por `NETATLAS_PG`)
- [x] **NET-HW-063 Réplica offline + outbox de contribuciones**: dominio puro `sincronizar()` (finalidad §23.4[3]) con `OutboxRepository` (cola local), `SyncServer`/`ReplicaRepository` (pull snapshot + push confirmado, LWW por versión) — sin red, pull y push fallan blandamente y **la cola permanece intacta**; adaptadores SQLite runtime-only (`netatlas_outbox`/`netatlas_replica`, FUERA del manifiesto §22.4) y transporte HTTP (`HttpSyncServer`)
- [x] **Criterio F8A — "app funciona offline y sincroniza al recuperar red"** (test de integración con servidor HTTP real + seed de 330 dispositivos): offline ⇒ 2 contribuciones encoladas y 0 perdidas con red caída; al recuperar la red ⇒ pull del snapshot puebla la réplica (330 dispositivos) y push confirma 2/2 (cola vacía); sin token ⇒ 401 y la cola persiste. **Aprobado**
- [x] CLI `pnpm --filter @netatlas/server server [--port]` (SQLite por defecto; `NETATLAS_PG` cambia a PostgreSQL; `NETATLAS_SERVER_TOKEN`/`NETATLAS_OIDC_*` para auth)
- [x] **Verificación**: 4 tests dominio sync + 20 tests server (API HTTP real + auth OIDC + adaptador PG + criterio) — suite global **330 tests / 10 suites**; typecheck 10/11 paquetes

### Pendiente F8A (refinamiento)

- [ ] E2E navegador de contribución → cola local → sync (requiere cablear la réplica en la UI PWA; el criterio ya se verifica a nivel de servicio)
- [ ] CRDT/last-writer-wins por entidad con merge en el servidor (hoy LWW por revisión por id de contribución)

## Estado de la Fase 8B (implementada — web pública y API, criterio F8B aprobado)

- [x] **NET-HW-065 API pública documentada (OpenAPI) + claves**: `@netatlas/server` expone `/v1/*` protegida por **clave API `na_…`** (solo se almacena el hash SHA-256, nunca el secreto — §22.2); **OpenAPI 3.1** servida en `GET /openapi.json` (ficha, búsqueda, categorías, snapshot, favoritos, perfil); **rate limiting** por clave (ventana deslizante, `NETATLAS_RATE`) con `429` + `Retry-After`; **auditoría** de cada petición autenticada (clave/endpoint/estado)
- [x] **NET-HW-064 Web pública + perfiles + favoritos sincronizados**: dominio puro `public/` (claves, `PerfilUsuario` con roles, `Favorito` con formato `tipo:slug` validado + límite de abuso); servidor con auto-creación de perfil `reader` en primer uso y endpoints `GET /v1/me`, `GET/POST/DELETE /v1/favorites`; **UI**: botón ★ en la ficha (localStorage, mismo contrato de datos que la API — sincronizable)
- [x] **Criterio F8B — "terceros consumen la API con clave"** (test de integración con servidor HTTP real): emisión de clave → sin clave 401 en `/v1/me`; con clave: búsqueda + ficha + categorías 200; favoritos add/list/remove; entidad mal formada 400; **rate limit 429** tras superar el límite; la clave nunca está en claro (solo hash)
- [x] CLI `pnpm --filter @netatlas/server server` — ahora sirve API pública `/v1` + `/openapi.json` (claves, rate limit) sobre el mismo volumen de sync interno
- [x] **Verificación**: `docs/api.md` documenta auth/claves/rate limit/ejemplos; suite global con `server 28/28` (incl. 8 tests del criterio F8B) + favoritos UI (2 tests); roadmap con **todas las fases cerradas**

### Pendiente F8B (refinamiento)

- [ ] Despliegue real: HTTPS/proxy, CDN de activos, conjuntos de datos descargables firmados (§31.3)
- [ ] Rate limit compartido multi-nodo (hoy in-memory por instancia)
- [ ] OIDC para consumidores humanos + roles curator/reviewer distribuidos (el sync interno ya valida JWT RS256)

## Esfuerzo orientativo (1–2 personas)

F0 4–6 sem · F1 12–16 · F2 6–8 · F3 6–8 · F4 6–8 · F5 4–6 · F6 6–8 · F7 8–10 · F8 10–14.

**Las fechas se gestionan por criterio de salida, no por calendario.**

## Estado de la suite (2025)

```
typecheck:     10 de 11 paquetes verdes (tsc --noEmit estricto; el workspace suma @netatlas/server)
tests:         55 suites con 347 verdes (domain 138 · data 37 · importers 15 · search 20 · ui 6 · app 84 · dataset-tools 11 · datagen 4 · server 32)
data:lint:     0 avisos / 0 errores sobre 330 dispositivos
dataset:build: 330 dispositivos · 118 protocolos · 101 estándares · 31 medios · 39 fabricantes · 26 categorías · 1123 aristas · 1114 assertions · 10 definiciones EAV / 52 valores · 3 topologías · esquema v2 + manifiesto firmado
bench:         p95 ≈ 2 ms sobre 10k sintéticos (criterio F0)
7 canónicas:   ✅ < 500 ms (tests permanentes)
app build:     ✅ vite build — PWA con SW (18 entradas precache); chunks: base 131 kB (38 gzip) + react-vendor 165 kB + cy-vendor 465 kB solo diagramas
UI-SQLite:     ✅ tests de integración sobre netatlas-seed.sqlite (Fase C)
E2E:           ✅ 40/40 en chromium y firefox (crítico + 404 + offline + ≤2 clics + topologías + SLO §23.2 + comparador CU-02 + calidad F6 + asistente F7)
IA:            ✅ data:ia --eval → 134 preguntas · 395 citas · fidelidad 100% · 0 alucinaciones · deploy autorizado (criterio F7)
F8A servidor:  ✅ API REST + auth OIDC (JWT RS256) + adaptadores SQLite/PostgreSQL + criterio offline+sync
F8B API púb.:  ✅ /v1 con clave na_… + OpenAPI 3.1 (/openapi.json) + rate limit 429 + auditoría + favoritos/perfil (criterio F8B)
Tauri:         ✅ build release local (netatlas-desktop.exe) + job CI Windows
CI:            jobs verify · ui (PWA) · e2e · tauri
```