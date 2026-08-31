# ADR-0007 · Versionado del conocimiento: bitemporal simplificado

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §9.7, §33.
- **Análisis**: un esquema bitemporal completo en cada tabla es caro; la necesidad real es "qué se sabía de esta entidad en fecha X" + auditoría de quién/cuándo/fuente.
- **Ventajas**:
  - `valid_from/valid_to` en entidades y aristas (tiempo de validez del dato).
  - `created_at/updated_at` (tiempo de registro).
  - `entity_history` con snapshot JSON por cambio aprobado (`create/update/deprecate/restore` + autor + fuente + rationale).
  - `lifecycle_status` (device) distingue obsoleto vs discontinuado vs legacy.
  - Changelog de dataset generable desde `entity_history`.
- **Inconvenientes**: snapshots JSON no consultables por proyección relacional (suficiente para auditoría).
- **Coste**: bajo.
- **Complejidad**: baja (una tabla de historia + dos columnas por tabla).
- **Escalabilidad**: archivo histórico en tablas `*_archive` al llegar a ~5M assertions.
- **Decisión**: adoptada.

**Consecuencias en F0**: columnas bitemporales y tabla `entity_history` ya presentes en `0001_init.sql`.