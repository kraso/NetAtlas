# ADR-047: Separación de orquestación en packages/app

Fecha: 2025-01-15
Status: Aceptado — Implementado

## Contexto
El PLAN MAESTRO (§26) propone un paquete `packages/app` que no existía físicamente.
La orquestación estaba dispersa en tres lugares:

1. `apps/app/src/viewmodels/search-store.ts` — SearchViewModel orquestaba suggestGrouped
   sobre `SqliteUiSearch.suggestGrouped` (mezcla query + lógica de presentación).
2. `apps/app/src/viewmodels/favorites-store.ts` — FavoritesStore usaba localStorage
   directamente + lógica de toggle inline.
3. `apps/app/src/composition-root-sqlite.ts` — `SqliteUiGraph`/`SqliteUiSearch` mezclaban
   orquestación (CTE recursivas, FTS5) con infraestructura.

Esto acoplaba la UI al acceso a datos y dificultaba testear la orquestación sin DB.

## Decisión
Crear `packages/app` (`@netatlas/app`) como capa de casos de uso orquestadores:
- **Definir contratos** (puertos secundarios) dentro del paquete app.
- **Extraer orquestaciones** de los viewmodels/stores hacia casos de uso puros.
- Los adaptadores (`in-memory.ts`, `composition-root-sqlite.ts`, `SqliteCatalogRepository`) implementan los contratos.
- La UI consume los casos de uso, no los adaptadores directamente.

## Casos de uso creados

| Caso de uso        | Extrae de                              | Orquesta                                          |
|--------------------|----------------------------------------|---------------------------------------------------|
| SearchDevices      | search-store.ts (DSL + query)          | SearchPort.query + parse DSL (`dslTerminos`)      |
| SuggestGrouped     | composition-root-sqlite (suggestGrouped)| SearchPort.suggest + CatalogPort (5 categorías)   |
| CompareDevices     | comparar.tsx (resolución + build)      | DevicePort + AttributesPort + GraphRepository     |
| ManageFavorites    | favorites-store.ts (toggle + storage)  | FavoritesPort                                     |
| BuildLocalGraph    | composition-root-sqlite.ts (vecindad)  | GraphRepository.neighbors + buildSubgraph         |
| BuildGlobalGraph   | composition-root-sqlite.ts (mapaGlobal)| GraphRepository.allEdges → proyección agregada    |
| ImportarLote       | tools/import-cli (pipeline)            | ImportarLote port (driver, dao, reporter)         |

## Contratos (puertos secundarios)

Definidos en `packages/app/src/index.ts`:
- `DevicePort` — findBySlug, listByCategory, findByManufacturer, count
- `SearchPort` — query (con facetFilters), suggest, suggestGrouped
- `CatalogPort` — listCategories, listManufacturers, manufacturerBySlug, categoryByCode, listProtocols, listStandards, listMedia
- `FavoritesPort` — list, add, remove
- `AttributesPort` — attributeDefinitionsByCategory, attributeValuesForDevice
- `GraphRepository` — re-export del dominio (`neighbors`, `allEdges`)
- `ImportarLote` — `ImportDeps { driver, dao, reporter }` desacoplando de `SqliteDriver` concreto

La proyección `buildSubgraph` y tipos `UiGraphSubgraph`/`UiGraphNode`/`UiGraphEdge`
se movieron a `packages/app/src/projections/subgraph.ts` (UI projection, no dominio).

## Alineación con el PLAN MAESTRO

| PLAN MAESTRO §30       | Caso de uso packages/app  | Status       |
|------------------------|---------------------------|--------------|
| GetDeviceSheet         | DevicePort.findBySlug     | Extraído     |
| SearchCatalog          | SearchDevices + SuggestGrouped | Extraído |
| CompareDevices         | CompareDevices            | Extraído     |
| BuildTopology          | BuildLocalGraph + BuildGlobalGraph | Extraído |
| ImportDataset          | ImportarLote              | Extraído     |

Roadmap (§27): F0 (arquitectura) → ADR-047 · F1 (MVP) → search/favorites stores · F3 (grafo) → build-local/global-graph · F5 (comparador) → compareDevices · F6 (pipeline) → importarLote.

## Consecuencias
- ✅ Los casos de uso son puros (testeables con dobles sin DB real).
- ✅ La UI depende de casos de uso, no de adaptadores concretos.
- ✅ Typecheck global (10 packages) y tests (~780) verdes.
- ✅ `listManufacturers` añadido al `CatalogRepository` del dominio y a todos los adaptadores (SQLite + in-memory) para alineación con el autocomplete Store/Fabricantes group.
- ⚠️ Los stores aún envuelven los casos de uso (extracción completa de stores pendiente — ver ADR-048).

## Referencias
- PLAN MAESTRO §26 (packages propuestos), §27 (roadmap), §30 (casos de uso)
- docs/architecture.md (arquitectura hexagonal)
- docs/adr/047-separacion-orquestacion-packages-app.md (este documento)
