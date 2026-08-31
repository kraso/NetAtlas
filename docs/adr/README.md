# ADRs — NetAtlas

Registro de decisiones arquitectónicas. Formato según PLAN MAESTRO §33.
**Toda decisión del plan maestro solo cambia mediante ADR nuevo.**

| ADR | Título | Estado |
|---|---|---|
| [ADR-0001](./ADR-0001-platform-hybrid-pwa-tauri.md) | Plataforma: híbrida web local-first + Tauri | ✅ Adoptado |
| [ADR-0002](./ADR-0002-persistence-sqlite-edge-table.md) | Persistencia: SQLite + tabla de aristas (no BD de grafos) | ✅ Adoptado |
| [ADR-0003](./ADR-0003-diagrams-svg-cytoscape.md) | Diagramas: SVG + Cytoscape.js (+ D3) | ✅ Adoptado |
| [ADR-0004](./ADR-0004-architecture-hexagonal-modular-monolith.md) | Arquitectura: monolito modular hexagonal | ✅ Adoptado |
| [ADR-0005](./ADR-0005-stack-typescript-react-vite-tauri.md) | Stack: TypeScript + React + Vite + Tauri | ✅ Adoptado |
| [ADR-0006](./ADR-0006-search-fts5-dsl-hybrid.md) | Búsqueda: FTS5 + DSL propio, evolución híbrida vectorial | ✅ Adoptado |
| [ADR-0007](./ADR-0007-knowledge-versioning-bitemporal.md) | Versionado del conocimiento: bitemporal simplificado | ✅ Adoptado |
| [ADR-0008](./ADR-0008-data-as-signed-artifact.md) | Datos como artefacto: dataset SQLite firmado | ✅ Adoptado |

## Cómo proponer un ADR

1. Copiar el formato de un ADR existente (análisis → ventajas → inconvenientes → coste →
   complejidad → escalabilidad → decisión).
2. Numerar `ADR-0009-…`; registrar aquí.
3. La decisión entra en vigor al actualizar este índice y, si afecta al modelo, la migración correspondiente.