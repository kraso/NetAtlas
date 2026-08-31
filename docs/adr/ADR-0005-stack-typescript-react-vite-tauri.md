# ADR-0005 · Stack: TypeScript + React + Vite + Tauri

- **Estado**: ✅ Adoptado · **Fecha**: 2025 · **Fuente normativa**: PLAN MAESTRO §5.3, §33.
- **Análisis**: TS/React/Vite + core Rust (Tauri) frente a .NET/Avalonia y Python/Qt. Ecosistema de grafos/búsqueda superior; un solo lenguaje en todo el stack; binario ligero (10–20 MB vs 150+ de Electron); testing maduro (Vitest, Playwright).
- **Ventajas**: TS estricto protege invariantes del modelo; Vite al lado de TypeScript; Tauri con actualizador firmado.
- **Inconvenientes**: WASM SQLite requiere Workers/OPFS bien configurados (F1); sin binding nativo "gratis" (resuelto con Tauri commands acotados); Rust toolchain en CI.
- **Coste**: bajo.
- **Complejidad**: media.
- **Escalabilidad**: alta — el mismo código corre en Node servidor en F8.
- **Decisión**: adoptada. TypeScript estricto desde F0 (tsconfig.base con strict, noUncheckedIndexedAccess, verbatimModuleSyntax).

**Consecuencias en F0**: los paquetes son TypeScript puro ESM con `tsc --noEmit` como typecheck en CI.