# ADR-0006 · Búsqueda: FTS5 + DSL propio, evolución a híbrida vectorial

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §12, §33.
- **Análisis**: Elasticsearch/Meilisearch descartados en local (operación desproporcionada para PWA/desktop); pgvector como destino F8.
- **Ventajas**:
  - FTS5 en SQLite: incluido, cero operación, insensible a diacríticos/mayúsculas, ranking bm25.
  - Facetas dinámicas vía GROUP BY sobre atributos tipados (nunca texto).
  - Mini-DSL propio (AST en dominio → SQL parametrizado en F1) con transparencia educativa.
  - Camino semántico sin tocar UI: `SearchIndex.query → hits[]` con score opaco (§12.5).
- **Inconvenientes**: sin ranking vectorial hasta F7 (sqlite-vec + ONNX MiniLM en cliente).
- **Coste**: bajo.
- **Complejidad**: media (parser + compilador DSL, NET-HW-012/013 en F1).
- **Escalabilidad**: <50 ms p95 en 10k (verificado en F0); 100k–1M vía PostgreSQL/pgvector F8.
- **Decisión**: adoptada. FTS5 + DSL; evolución híbrida `α·bm25 + β·cos_sim + γ·boost_oficial` en F7.

**Evidencia F0**: `pnpm bench` → p95 ≈ 2 ms sobre 10k dispositivos sintéticos (criterio F0: <50 ms).