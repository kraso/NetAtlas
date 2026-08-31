# ADR-0008 · Datos como artefacto: dataset SQLite firmado, separado del código

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §19.4, §22.2, §33.
- **Análisis**: el conocimiento debe actualizarse sin redeploy de la app y sin riesgo de corrupción silenciosa.
- **Ventajas**:
  - El dataset es un archivo (`netatlas-YYYYMMDD-rN.sqlite`) versionado, firmado (Ed25519) y distribuible con su `manifest.json` (versión de esquema, conteos, hash SHA-256, changelog).
  - Actualización incremental por diff de manifiestos (delta de activos + lote SQL), fallback a descarga completa si el esquema migra.
  - `min/max_dataset_version` en la app → aviso claro, nunca corrupción.
  - Cero migraciones de código para equivaler a "release de conocimiento".
- **Inconvenientes**: requiere tooling de firma y verificación (F6, NET-HW-048/057).
- **Coste**: medio (tooling + pipeline de build).
- **Complejidad**: media.
- **Escalabilidad**: alta — la separación dato/código habilita datasets comunitarios namespaced y el modo sincronizado F8.
- **Decisión**: adoptada. Los datos se versionan, firman y distribuyen independientemente de la app.

**Consecuencias en F0**: el seed vive en `datasets/seed/` (fuentes JSON curadas) y se compila a SQLite
vía `dataset:build`; el `.sqlite` resultante es el prototipo del artefacto firmable.