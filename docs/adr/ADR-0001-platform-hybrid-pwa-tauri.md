# ADR-0001 · Plataforma: híbrida web local-first + Tauri

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §5, §33.
- **Análisis**: matriz ponderada de 4 alternativas (17 criterios): C híbrida 4,48 > A web 3,72 > D cliente-servidor 3,55 > B escritorio nativo 3,32.
- **Ventajas**: un solo código para PWA + escritorio; offline real; el mejor ecosistema de diagramas (SVG/Cytoscape); evolución a servidor añadiendo un adaptador (nunca reescritura).
- **Inconvenientes**: disciplina estricta de adaptadores de persistencia; doble target en CI (PWA+binario); OPFS con cuotas en navegador.
- **Coste**: ~15% extra sobre "solo web" (adaptadores + builds Tauri).
- **Complejidad**: media, acotada a infraestructura; el dominio no la percibe.
- **Escalabilidad**: alta — el camino a Fase 8 es añadir un adaptador HTTP→PostgreSQL, no migrar.
- **Decisión**: adoptada. El producto corre como PWA offline y como binario Tauri (≈10–20 MB) desde el mismo núcleo.

**Consecuencias en F0**: lecturas/persistencia detrás de `SqliteDriver` (interfaz mínima) para que wa-sqlite (F1 navegador) y node:sqlite (CLI/desktop) compartan contrato.