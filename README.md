# NetAtlas

> **Enciclopedia técnica interactiva y sistema de conocimiento sobre hardware de redes de comunicaciones.**
> Estado: **F1-F9 cerradas** — MVP completo con PWA offline + escritorio Tauri + servidor de sincronización (ver `docs/roadmap.md`).

NetAtlas no es una wiki ni un catálogo CRUD: es un **grafo de conocimiento técnico navegable** en el que dispositivos, fabricantes, familias, componentes, interfaces, protocolos, estándares, medios de transmisión, capas OSI/TCP-IP, tecnologías, topologías y evolución histórica son entidades de primera clase conectadas por relaciones tipadas, versionadas y respaldadas por fuentes.

## Documento maestro

El documento de referencia normativo es [`PLAN MAESTRO — APLICACIÓN ENCICLOPÉDICA DE HARDWARE DE REDES.md`](PLAN%20MAESTRO%20%E2%80%94%20APLICACI%C3%93N%20ENCICLOP%C3%89DICA%20DE%20HARDWARE%20DE%20REDES.md). Cualquier divergencia respecto a él se resuelve mediante ADR (`docs/adr/`).

## Decisiones vertebrales (resumen)

| Eje | Decisión |
|---|---|
| Plataforma | Híbrida: núcleo web local-first (PWA offline) + empaquetado de escritorio con Tauri |
| Stack | TypeScript + React + Vite, SQLite embebido, monorepo pnpm |
| Persistencia | SQLite relacional + tabla de aristas (grafo materializado) |
| Búsqueda | SQLite FTS5 + filtros estructurados + mini-DSL |
| Arquitectura | Monolito modular hexagonal (dominio puro, puertos/adaptadores, MVVM en presentación) |
| Diagramas | SVG con Cytoscape.js y layouts automáticos |
| Datos | Cada dato técnico relevante es una afirmación con fuente, nivel de confianza y fecha de verificación |
| IA | Fase posterior: RAG sobre la base validada; nunca requisito de la v1 |

## Estructura (Fase 0)

```text
packages/
  domain/       # Entidades, value objects, puertos (TypeScript puro, sin deps)
  data/         # Adaptadores SQLite: migraciones (0001_init.sql), DAOs
  search/       # Índice FTS5, DSL→AST (base), facetas
tools/
  dataset-tools/ # data:lint — invariantes del seed + dataset:build — seed → SQLite
  datagen/      # Generador sintético de escala (10k dispositivos) + benchmark FTS5
datasets/
  seed/         # Fuente curada: taxonomía + 20 fichas piloto (JSON con assertions)
docs/           # Documentación viva + ADRs
```

> Nota de estructura: según el plan maestro (§26), las herramientas de datos
> (`datagen`, `dataset-build` → aquí `dataset-tools`, `import-cli`) viven bajo
> `tools/`, no bajo `packages/`; los paquetes reutilizables por la app son
> `domain`, `data`, `search` (y en F1+, `app`, `diagrams`, `importers`, …).

## Comandos

> Guía completa de instalación y prueba (Windows y Linux, instaladores
> `.msi`/`.exe` y `.deb`/`.rpm`/`.AppImage`) en **[`docs/INSTALL.md`](docs/INSTALL.md)**.

```bash
pnpm install          # instalar dependencias del monorepo
pnpm typecheck        # tsc --noEmit en todos los paquetes
pnpm test             # tests unitarios (Vitest)
pnpm data:lint        # validación de invariantes del dataset seed
pnpm bench            # benchmark FTS5 sobre 10k dispositivos sintéticos

# Aplicación web (PWA offline) — http://localhost:5173
pnpm --filter @netatlas/app dev
# Build de producción + preview — http://127.0.0.1:4173
pnpm --filter @netatlas/app build
pnpm --filter @netatlas/app preview

# Escritorio (Tauri v2) — requiere Rust toolchain
pnpm --filter @netatlas/app tauri dev
pnpm --filter @netatlas/app tauri build   # instaladores por plataforma

# Servidor de sincronización (F8A): API /api + /v1 pública, puerto 8787
pnpm --filter @netatlas/server server        # necesita NETATLAS_SERVER_TOKEN (o OIDC)
pnpm --filter @netatlas/server server:e2e    # backend de pruebas (copia temporal del seed)

# Suites E2E (Playwright, chromium + firefox; levanta PWA y backend)
pnpm --filter @netatlas/app test:e2e
```

## Criterio de salida de la Fase 0

1. ADRs firmados en `docs/adr/` (ADR-0001 … ADR-0008).
2. Spike SQLite+FTS5 demuestra búsqueda **< 50 ms p95 sobre 10k dispositivos sintéticos** (`pnpm bench`).
3. Esquema inicial `0001_init.sql` con las entidades núcleo del modelo (sección 9 del plan maestro).
4. Entidades de dominio + value objects con typecheck estricto y tests.
5. Dataset seed: 15 macrocategorías + 20 fichas piloto con assertions y fuentes.