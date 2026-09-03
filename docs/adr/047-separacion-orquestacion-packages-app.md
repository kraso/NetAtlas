# ADR-047: Separación de orquestación en packages/app
Fecha: 2025-01-15
Status: Aceptado — Implementado

## Contexto
El PLAN MAESTRO (§26) propone un paquete `packages/app` que no existía físicamente.
La orquestación estaba dispersa en dos lugares:

1. `apps/app/src/viewmodels/search-store.ts` — SearchViewModel orquestaba suggestGrouped
   sobre SqliteUiSearch.suggestGrouped (mezcla query + lógica de presentación).
2. `apps/app/src/viewmodels/favorites-store.ts` — FavoritesStore usaba localStorage
   directamente + lógica de toggle inline.
3. `apps/app/src/composition-root-sqlite.ts` — SqliteUiGraph/ SqliteUiSearch mezclaban
   orquestación (CTE recursivas, FTS5) con infraestructura.

Esto acoplaba la UI al acceso a datos y dificultaba testear la orquestación sin DB.

## Decisión
Crear `packages/app` (`@netatlas/`) como capa de casos de uso orquestadores:
- **Definir contratos** (puertos secundarios) dentro del paquete app.
- **Extraer orquestaciones** de los viewmodels/stores hacia casos de uso puros.
- Los adaptadores (`in-memory.ts`, `composition-root-sqlite.ts`) implementan los contratos.
- La UI consume los casos de uso, no los adaptadores directamente.

## Casos de uso creados
| Caso de uso        | Extrae de                              | Orquesta                                         |
|--------------------|----------------------------------------|--------------------------------------------------|
| SearchDevices      | search-store.ts (DSL + query)          | SearchPort.query + parse DSL                     |
| SuggestGrouped     | composition-root-sqlite (suggestG)     | SearchPort.suggest + CatalogPort                 |
| CompareDevices     | comparar.tsx (resolución + build)      | DevicePort + AttributesPort + GraphRepository    |
| ManageFavorites    | favorites-store.ts (toggle + storage)  | FavoritesPort                                    |

## Consecuencias
- ✅ Los casos de uso son puros (testeables con dobles sin DB real).
- ✅ La UI depende de casos de uso, no de adaptadores concretos.
- ✅ Typecheck global (13 packages) y tests (750) verdes.
- ⚠️ Los stores existentes aún envuelven los casos de uso (extracción pendiente — ver ADR siguiente).

## Referencias
- PLAN MAESTRO §26 (packages propuestos)
- docs/architecture.md (arquitectura hexagonal)
