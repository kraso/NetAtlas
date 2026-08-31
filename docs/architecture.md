# Arquitectura — NetAtlas

> Fuente normativa: PLAN MAESTRO §6. Este documento es la versión viva; divergencias por ADR.

## 6.1 Estilo arquitectónico

**Monolito modular con arquitectura hexagonal (Clean) y MVVM en presentación.**

- **Dominio** (`packages/domain`): TypeScript puro sin dependencias de framework. Entidades, value objects y servicios puros.
- **Puertos** (interfaces del dominio): `DeviceRepository`, `CatalogRepository`, `GraphRepository`, `SearchIndex`, `AssetStore`, `Clock`, `IdGen`, `Logger`.
- **Aplicación** (`packages/app`, F1+): casos de uso orquestadores.
- **Infraestructura** (`packages/data`, `packages/search`, F1+): adaptadores SQLite/FTS5/archivos.
- **Presentación** (`apps/app`, F1+): React + ViewModels (hooks + stores Zustand).

Regla de dependencias: las flechas apuntan siempre hacia el dominio. El dominio no importa nada de React, SQLite ni Tauri.

## 6.2 Implementación en Fase 0

La Fase 0 entrega el **dominio puro** y los **adaptadores base de persistencia y búsqueda**:

| Paquete | Rol | Estado F0 |
|---|---|---|
| `@netatlas/domain` | Entidades, VO, puertos, catálogo de predicados, AST DSL | ✅ implementado + tests |
| `@netatlas/data` | Migraciones (0001_init.sql), migrator, driver SQLite, DAO de catálogo | ✅ implementado + tests |
| `@netatlas/search` | `Fts5SearchIndex` (implementa puerto `SearchIndex`) | ✅ implementado + tests |
| `@netatlas/dataset-tools` | `data:lint` (invariantes), `dataset:build` (seed → SQLite) | ✅ implementado + tests |
| `@netatlas/datagen` | Generador sintético 10k + benchmark FTS5 (criterio F0) | ✅ implementado + tests |

## 6.3 Puertos del dominio (Fase 0)

- `DeviceRepository.findBySlug / findByIds / listByCategory / findByManufacturer / count / save`
- `CatalogRepository.manufacturerBySlug / categoryByCode / listCategories`
- `GraphRepository.neighbors / paths / edgesOf` (CTE recursiva en SQLite; F3 impl.)
- `SearchIndex.query / suggest / byMaxSpeed` (adaptador FTS5 en F0)
- `Clock / IdGen / Logger` (utilidades)

## 6.4 DI (composition-root)

La composición (F1+) cablea adaptadores por runtime:

```text
PWA    → wa-sqlite (WASM-OPFS) → DeviceRepository…
Tauri  → node:sqlite (nativo)  → DeviceRepository…
Tests  → :memory: (NodeSqliteDriver)
```

El driver `NodeSqliteDriver` (paquete `@netatlas/data`) expone el contrato mínimo `SqliteDriver`
que cualquier implementación (WASM/nativo) debe satisfacer.

## 6.5 Decisiones de detalle

- Sin ORM pesado: SQL explícito + query-builder ligero (kysely en F1+); en F0 SQL directo parametrizado.
- Migraciones: `packages/data/migrations/NNNN_nombre.sql` + migrator transaccional con `schema_version`.
- Entidades congeladas (`Object.freeze`) para lecturas inmutables.
- Errores tipados del dominio (throw con mensajes normativos; `Result<T,E>` en casos de uso F1+).