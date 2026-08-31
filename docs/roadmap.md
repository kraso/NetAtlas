# Roadmap — NetAtlas

> Fuente normativa: PLAN MAESTRO §27. Estado: **Fase 1 (MVP) — núcleo de datos/búsqueda implementado; UI React pendiente**.

## Fases

| Fase | Nombre | Contenido | Criterio de salida | Estado |
|---|---|---|---|---|
| **F0** | Investigación y arquitectura | Plan; spikes SQLite+FTS5; prototipo de esquema; 20 fichas piloto | ADRs firmados; búsqueda <50 ms p95 sobre 10k sintéticos | ✅ **cerrada** |
| **F1** | MVP | Catálogo + fichas + búsqueda FTS/DSL + vista OSI + fuentes v1 + importación JSON/CSV + seed 300–500 | Criterios 28.1.6 | 🔄 **en curso (núcleo ≈70%)** |
| **F2** | Catálogo avanzado | EAV completo, pantallas de exploración, glosario, calculadoras | 15 macrocategorías pobladas; cobertura fuentes ≥80% | ⏳ |
| **F3** | Relaciones y búsqueda avanzada | Grafo completo, facetas dinámicas, mapa local, genealogía básica | Navegación ≤2 clics verificada en E2E | ⏳ |
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

### Pendiente para cerrar F1 (contenido y refuerzos)

- [ ] Seed hacia 300–500 vía importación asistida (mecanismo listo: `packages/importers`)
- [ ] 13 pestañas completas de la ficha (Protocolos con insignia, Estándares, Compatibilidad, Historia…)
- [ ] Conexión de la UI al dataset real vía wa-sqlite (F1-late; hoy adaptador in-memory)

## Esfuerzo orientativo (1–2 personas)

F0 4–6 sem · F1 12–16 · F2 6–8 · F3 6–8 · F4 6–8 · F5 4–6 · F6 6–8 · F7 8–10 · F8 10–14.

**Las fechas se gestionan por criterio de salida, no por calendario.**

## Estado de la suite (2025)

```
typecheck:     8 paquetes verdes (tsc --noEmit estricto)
tests:         132 (domain 55 · data 17 · importers 11 · search 20 · ui 6 · app 11 · dataset-tools 8 · datagen 4)
data:lint:     0 avisos / 0 errores sobre 31 dispositivos
dataset:build: 31 dispositivos · 118 protocolos · 101 estándares · 31 medios · 39 fabricantes · 26 categorías · 60 aristas · 51 assertions
bench:         p95 ≈ 2 ms sobre 10k sintéticos (criterio F0)
7 canónicas:   ✅ < 500 ms (tests permanentes)
app build:     ✅ vite build — PWA con SW (12 entradas precache) + manifest + icons 192/512
E2E:           ✅ 5/5 (flujo crítico 28.1.6#3 + 404 + offline PWA) en chromium y firefox
Tauri:         ✅ build release local (netatlas-desktop.exe) + job CI Windows
CI:            jobs verify · ui (PWA) · e2e · tauri
```