# Base de datos — NetAtlas

> Fuente normativa: PLAN MAESTRO §9 (modelo de datos) y §20 (trazabilidad). Versión viva.

## Motor

**SQLite** relacional + tabla de aristas genérica (`relationship`) + FTS5. Elegido en ADR-0002.
El esquema se migra por scripts numerados (0001_init.sql …) gestionados por el migrator
(`packages/data/src/migrator.ts`), que registra en `schema_version`.

## Esquema canónico (migración 0001)

Implementado en `packages/data/migrations/0001_init.sql`. Entidades núcleo:

| Dominio | Tablas |
|---|---|
| Catálogo | `manufacturer`, `product_family`, `category`, `device`, `device_category_role` |
| Inventario físico | `interface`, `port` |
| EAV acotado | `attribute_definition`, `device_attribute` |
| Grafo | `predicate`, `relationship` (+ índice parcial de cardinalidad `one`) |
| Trazabilidad | `source`, `assertion` |
| Catálogos cerrados | `protocol`, `standard`, `medium`, `technology`, `speed_grade`, `osi_layer`, `tcpip_layer` |
| Arquitectura | `component`, `device_component` |
| Docs/activos | `firmware`, `power_spec`, `image`, `datasheet`, `reference` |
| Glosario | `glossary_term` |
| Topologías (F4) | `topology`, `topology_node`, `topology_edge` |
| Versionado | `entity_history`, `import_batch` |
| Búsqueda | `fts_device` (FTS5 contentless + triggers) |
| Vistas | `v_device`, `v_device_protocols`, `v_device_standards`, `v_genealogy` |

Notas de implementación:
- `JSON` embebido solo para listas cerradas sin consulta relacional (`speeds_json`, `osi_profile_json`, `aliases_json`).
- Los binarios (imágenes, datasheets) **nunca** van en la BD: metadatos + hash de contenido, activos en OPFS/FS/CDN.
- `fts_device` es contentless (`content=''`) con triggers `AI/AD/AU`; el parámetro `tokenize` usa
  `unicode61 remove_diacritics 2` (búsqueda insensible a mayúsculas y acentos).
- El índice parcial `idx_rel_one_current` materializa la cardinalidad `one` de predicados
  (`manufactured-by`, `belongs-to-family`, `has-category`), una arista vigente por sujeto.

## Migraciones

```bash
pnpm migrate --path=./netatlas.sqlite   # aplica pendientes, imprime versión final
```

Reglas:
- Archivos `NNNN_nombre.sql`, ordenados por versión.
- Cada migración se aplica en su propia transacción; fallo → rollback completo.
- Una vez publicada, una migración es **inmutable**: los cambios nuevos son `0002_nnn.sql`.
- El dataset declara su versión (`schema_version`); la app migra al abrirlo y verifica
  compatibilidad `min/max_dataset_version` (F1).

## Integridad

- `PRAGMA foreign_keys = ON` por driver.
- `PRAGMA integrity_check` al abrir dataset (F1+).
- WAL + `synchronous = NORMAL` por driver; backup antes de migrar esquema.
- Invariantes de grafo validados por `data:lint` (ver `docs/testing.md`).