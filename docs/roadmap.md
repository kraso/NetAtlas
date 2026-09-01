# Roadmap — NetAtlas

> Fuente normativa: PLAN MAESTRO §27. Estado: **Fase 3 (Relaciones y búsqueda avanzada) — implementada**.

## Fases

| Fase | Nombre | Contenido | Criterio de salida | Estado |
|---|---|---|---|---|
| **F0** | Investigación y arquitectura | Plan; spikes SQLite+FTS5; prototipo de esquema; 20 fichas piloto | ADRs firmados; búsqueda <50 ms p95 sobre 10k sintéticos | ✅ **cerrada** |
| **F1** | MVP | Catálogo + fichas + búsqueda FTS/DSL + vista OSI + fuentes v1 + importación JSON/CSV + seed 300–500 | Criterios 28.1.6 (los 6) | ✅ **cerrada** |
| **F2** | Catálogo avanzado | Calculadoras, exploradores de catálogos, autocompletado, fabricantes, glosario, panel frontal, migas | 15 macrocategorías pobladas; cobertura fuentes ≥80% | ✅ **cerrada** |
| **F3** | Relaciones y búsqueda avanzada | Grafo completo, facetas dinámicas, mapa local, genealogía básica | Navegación ≤2 clics verificada en E2E | ✅ **cerrada** |
| **F4** | Diagramas interactivos | Mapa global, topologías, panel frontal, exportación | SLOs de diagramas | ⏳ |
| **F5** | Comparador | Motor + UI + veredicto + exportación | CU-02 aprobado | ⏳ |
| **F6** | Estándares/protocolos/importación pro | Exploradores completos, dedup/reconciliación, calidad de fuentes | Lote externo sin SQL a mano | ⏳ |
| **F7** | IA | RAG + asistente + generación de topologías + eval | 0 alucinaciones de specs | ⏳ |
| **F8A/B** | Sincronización + web pública | Servidor PostgreSQL, API, auth | offline+sync; API consumible | ⏳ |

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

## Esfuerzo orientativo (1–2 personas)

F0 4–6 sem · F1 12–16 · F2 6–8 · F3 6–8 · F4 6–8 · F5 4–6 · F6 6–8 · F7 8–10 · F8 10–14.

**Las fechas se gestionan por criterio de salida, no por calendario.**

## Estado de la suite (2025)

```
typecheck:     9 paquetes verdes (tsc --noEmit estricto)
tests:         16 suites con 172+ verdes (domain 69 · data 28 · importers 11 · search 20 · ui 6 · app 52 · dataset-tools 9 · datagen 4)
data:lint:     0 avisos / 0 errores sobre 330 dispositivos
dataset:build: 330 dispositivos · 118 protocolos · 101 estándares · 31 medios · 39 fabricantes · 26 categorías · 1123 aristas · 1114 assertions · 10 definiciones EAV / 52 valores
bench:         p95 ≈ 2 ms sobre 10k sintéticos (criterio F0)
7 canónicas:   ✅ < 500 ms (tests permanentes)
app build:     ✅ vite build — PWA con SW (12 entradas precache) + manifest + icons 192/512
UI-SQLite:     ✅ tests de integración sobre netatlas-seed.sqlite (Fase C)
E2E:           ✅ 14/14 en chromium y firefox (flujo crítico 28.1.6#3 + 404 + offline PWA + navegación ≤2 clics O3/F3)
Tauri:         ✅ build release local (netatlas-desktop.exe) + job CI Windows
CI:            jobs verify · ui (PWA) · e2e · tauri
```