# Roadmap — NetAtlas

> Fuente normativa: PLAN MAESTRO §27. Estado: **Fase 0 en curso**.

## Fases

| Fase | Nombre | Contenido | Criterio de salida | Estado |
|---|---|---|---|---|
| **F0** | Investigación y arquitectura | Plan; spikes SQLite+FTS5; prototipo de esquema; 20 fichas piloto | ADRs firmados; búsqueda <50 ms p95 sobre 10k sintéticos | 🔄 **en curso** |
| **F1** | MVP | Catálogo + fichas + búsqueda FTS/DSL + vista OSI + fuentes v1 + importación JSON/CSV + seed 300–500 | Criterios 28.1.6 | ⏳ |
| **F2** | Catálogo avanzado | EAV completo, pantallas de exploración, glosario, calculadoras | 15 macrocategorías pobladas; cobertura fuentes ≥80% | ⏳ |
| **F3** | Relaciones y búsqueda avanzada | Grafo completo, facetas dinámicas, mapa local, genealogía básica | Navegación ≤2 clics verificada en E2E | ⏳ |
| **F4** | Diagramas interactivos | Mapa global, topologías, panel frontal, exportación | SLOs de diagramas | ⏳ |
| **F5** | Comparador | Motor + UI + veredicto + exportación | CU-02 aprobado | ⏳ |
| **F6** | Estándares/protocolos/importación pro | Exploradores completos, dedup/reconciliación, calidad de fuentes | Lote externo sin SQL a mano | ⏳ |
| **F7** | IA | RAG + asistente + generación de topologías + eval | 0 alucinaciones de specs | ⏳ |
| **F8A/B** | Sincronización + web pública | Servidor PostgreSQL, API, auth | offline+sync; API consumible | ⏳ |

## Estado de la Fase 0 (checklist)

- [x] Monorepo pnpm + paquetes domain/data/search/dataset-tools/datagen
- [x] Esquema inicial `0001_init.sql` (entidades núcleo completas)
- [x] Entidades de dominio + value objects + puertos + tests (36 unit)
- [x] FTS5 + facetas + sugerencias (tests de integración)
- [x] `data:lint` verde sobre el seed (0 errores)
- [x] `dataset:build` genera `netatlas-seed.sqlite` (18 dispositivos, 30 aristas, 29 assertions)
- [x] Benchmark FTS5: **p95 ≈ 2 ms** sobre 10k sintéticos (criterio: <50 ms)
- [x] ADRs 0001–0008 en `docs/adr/`
- [x] docs vivos (architecture, database, taxonomy, roadmap, testing, sourcing)
- [x] CI GitHub Actions (lint+typecheck+test+data:lint+bench)
- [ ] 20 fichas piloto completas con fuentes oficiales (18 presentes; completar a 20 y revisar fuentes)

## Esfuerzo orientativo (1–2 personas)

F0 4–6 sem · F1 12–16 · F2 6–8 · F3 6–8 · F4 6–8 · F5 4–6 · F6 6–8 · F7 8–10 · F8 10–14.

**Las fechas se gestionan por criterio de salida, no por calendario.**