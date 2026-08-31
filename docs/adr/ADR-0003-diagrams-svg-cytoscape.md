# ADR-0003 · Diagramas: SVG + Cytoscape.js (+ D3)

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §13, §33.
- **Análisis**: comparación de tecnologías de render (§13.1). Requisito de primer orden: diagramas interactivos accesibles y exportables.
- **Ventajas**:
  - SVG → DOM accesible (WCAG), zoom/pan nativo, exportación vectorial.
  - Cytoscape.js: layouts automáticos maduros (fcose/ELK), estilos por datos, extensiones.
  - D3 para vistas a medida (timeline, carriles de velocidad, panel OSI).
  - Ecosistema web objetivamente superior al de toolkits nativos.
- **Inconvenientes**: SVG degrada con >5k nodos → agregación por categoría y modo Canvas ya previstos (umbral documentado).
- **Coste**: bajo (OSS maduro, sin licencia).
- **Complejidad**: media.
- **Escalabilidad**: suficiente hasta F8 con agregación; Canvas/WebGL como escalado futuro.
- **Decisión**: adoptada. Render principal SVG; Cytoscape.js como motor de grafos; D3 como complemento.

**Consecuencias en F0**: sin código de diagramas todavía (F4), pero la decisión no cambia el esquema
(tablas `topology_*` ya existen vacías).