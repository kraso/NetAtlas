# ADR-0004 · Arquitectura software: monolito modular hexagonal

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §6.1, §33.
- **Análisis**: comparación de estilos (§6.1): Clean (concepto), hexagonal (puertos/adaptadores), MVVM (presentación), monolito modular (empaquetado). Microservicios evaluados y descartados por principio 13 (sobreingeniería prematura).
- **Ventajas**: simplicidad; testabilidad del dominio puro; adaptadores intercambiables (PWA/Tauri/servidor); refactor barato con fronteras explícitas; dependencias verificadas en CI.
- **Inconvenientes**: exige disciplina de puertos y gobernar dependencias entre módulos (dependency-cruiser).
- **Coste**: bajo (cero infraestructura extra).
- **Complejidad**: media en gobernanza, baja en runtime.
- **Escalabilidad**: alta — motor de la evolución a cliente-servidor (F8) sin reescritura (§6.7).
- **Decisión**: adoptada. Microservicios rechazados con nota de salida futura en §6.7.

**Consecuencias en F0**: `packages/domain` sin dependencias de framework; puertos definidos; el resto de paquetes son adaptadores.