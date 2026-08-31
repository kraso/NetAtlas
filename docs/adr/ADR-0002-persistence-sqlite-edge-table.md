# ADR-0002 · Persistencia: SQLite + tabla de aristas (no BD de grafos)

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §9.1, §9.5, §33.
- **Análisis**: el dominio es ~80% relacional (catálogos, N:M, FTS) y ~20% grafo (vecindad, caminos 2–3 saltos). Comparación de motores en §9.1.
- **Ventajas**:
  - Archivo único portable y firmable (dataset distribuible).
  - FTS5 incluido (búsqueda sin servicio externo).
  - Corre en WASM (navegador) y nativo (Node/Tauri) con el mismo SQL.
  - CTE recursivas cubren vecindad y caminos acotados (<10 ms a escala 10⁵).
  - SQL portable a PostgreSQL (destino Fase 8).
- **Inconvenientes**: consultas de grafo profundo (>3 saltos) menos elegantes que Cypher; sin motor de algoritmos de grafos.
- **Coste**: bajo (cero operación).
- **Complejidad**: baja-media (CTEs puntuales ya especificadas en §9.5).
- **Escalabilidad**: a 10⁶ dispositivos migra el **adaptador** a PostgreSQL; `predicate`+`relationship` es un
  grafo de propiedades exportable a Neo4j/RDF si F8+ lo justifica.
- **Decisión**: adoptada. **BD de grafos dedicada descartada para v1–v7.**

**Consecuencias en F0**: migración `0001_init.sql` con tablas `predicate`/`relationship` + índice parcial
de cardinalidad `one` + vistas de proyección (`v_device_protocols`, `v_device_standards`, `v_genealogy`).