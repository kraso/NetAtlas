# Testing — NetAtlas

> Fuente normativa: PLAN MAESTRO §24. Estado F0.

## Pirámide y cobertura prioritaria

| Tipo | Herramienta | Cobertura prioritaria | Estado F0 |
|---|---|---|---|
| Unit | Vitest | Dominio ≥90%: VO, entidades, predicados, invariantes | ✅ 36 tests |
| Integration | Vitest + SQLite real | Migraciones, DAO, FTS sincronizado, seed→BD | ✅ 13 tests |
| Data consistency | `data:lint` | Invariantes 8.6/19.5 sobre el seed | ✅ 0 errores |
| Performance | `pnpm bench` | SLO 23.2: búsqueda p95 <50 ms sobre 10k | ✅ p95 ≈ 2 ms |
| Property-based | fast-check | Importación, DSL (F1+) | ⏳ |
| UI / E2E | Testing Library / Playwright | F1+ | ⏳ |

## Estado de la suite F0

```
packages/domain        36 unit   (slug, VO, OSI, lifecycle, catálogo, grafo, sourcing)
packages/data           7 integ  (migración 0001, idempotencia, tablas, vistas, FTS triggers)
packages/search         6 integ  (FTS5, facetas, filtros, sugerencias, byMaxSpeed)
tools/dataset-tools     6 integ  (data:lint seed, dataset:build seed→SQLite)
tools/datagen           4 unit    (generador determinista)
─────────────────────────────────────────
Total: 59 tests
```

## data:lint — invariantes verificadas

1. Categorías sin padres inexistentes (árbol válido).
2. Dispositivos con categoría primaria existente.
3. Fabricantes referenciados existen.
4. Slugs únicos.
5. `lifecycle_status` canónico.
6. Assertions con fuente existente y confianza válida.
7. Predicados de relaciones conocidos; extremos referenciados.
8. `replaced-by` ⇒ sujeto en `{eol,eos,discontinued}`.
9. Genealogía acíclica (DFS sobre `succeeds`/`evolves-into`/`replaced-by`).

## Definition of Done (extracto)

- tests nuevos/actualizados verdes · `data:lint` verde · migración reversible ·
  doc actualizada (`docs/`) · `tsc --noEmit` sin errores · sin deuda de tipos.