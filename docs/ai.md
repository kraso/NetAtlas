# IA de NetAtlas — RAG, herramientas y guardarraíles (sección 21, F7)

> Fuente normativa: PLAN MAESTRO §21 (Inteligencia artificial) y §27 (F7).
> Estado: **implementada (F7)** — criterio: 0 alucinaciones de specs en eval.

## Arquitectura (local-first, hexagonal)

```
pregunta del usuario
  → [1] comprensión: comprender() traduce NL → plan (herramientas + DSL)
  → [2] recuperación: ToolContext (FTS + repositorios) → hechos con fuente
  → [3] respuesta: responderConContexto() redacta SOLO con el contexto
  → [4] citas obligatorias: cada afirmación enlaza a su entidad/fuente
  → [5] acciones: herramientas de function-calling ejecutadas y mostradas
```

Los módulos viven en el **dominio puro** (`packages/domain/src/ia/`, sin
dependencias de framework) y el adaptador real en `packages/data`:

| Módulo | Responsabilidad |
|---|---|
| `ia/assistant.ts` | Puerto `AssistantPort` + tipos (cita, herramienta, respuesta) |
| `ia/tools.ts` | Catálogo de herramientas function-calling (§21.1[5]) + `ToolContext` |
| `ia/comprender.ts` | NL → plan determinista: los 5 escenarios de §21.2 |
| `ia/rag.ts` | Redacción con citas obligatorias + guardarraíl de honestidad |
| `ia/embeddings.ts` | Embeddings TF-IDF locales + ranking híbrido (NET-HW-016) |
| `ia/topologia.ts` | NL → especificación de topología validada (NET-HW-061) |
| `ia/evaluador.ts` | Conjunto de oro + runner de eval (criterio F7) |
| `ia/cliente.ts` | Orquestación: comprensión → herramientas → respuesta citada |
| `data/src/ia/sqlite-assistant.ts` | `ToolContext` SQLite real + oráculo + generador de oro |

## Guardarraíles (lo no negociable)

1. **Nunca inventa datos**: la redacción solo interpola hechos recuperados de
   la base validada. No hay plantillas con cifras libres.
2. **Citas obligatorias**: cada afirmación enlaza a `(tipo, slug, afirmación)`;
   las numéricas llevan su `fuenteSlug` (assertion).
3. **Honestidad**: sin contexto → `modo: 'no-tengo-datos'` y lo dice en texto.
   El evaluador lo comprueba contra el dataset, no contra lo que alegue el
   asistente.
4. **Feature flag `ai.enabled` OFF por defecto** (§21.4): la app es 100%
   funcional sin IA; el chat lo muestra apagado hasta que el usuario lo activa.
5. **Sin bypass de validaciones**: la generación de topologías usa los
   invariantes del agregado (`Topology.create`) y `validateLinkCompatibility`;
   la comparación usa el motor puro del comparador.
6. **Transparencia de herramientas**: cada respuesta muestra qué herramientas
   ejecutó (`<details>` en el chat) — §21.1[5].

## Herramientas expuestas (§21.1)

`search_catalog(dsl)`, `compare_devices(ids)`, `get_device(slug)`,
`find_compatible(device, constraint)`, `build_topology(spec)`,
`what_layers(device)`, `successors(device)` — contrato en `HERRAMIENTAS`
(esquema JSON para function calling). La IA es un cliente más de la capa de
aplicación: cero acceso directo a la BD desde el dominio.

## Los cinco escenarios (§21.2)

| Escenario | Disparo de ejemplo | Herramientas |
|---|---|---|
| Asistente técnico | "¿Qué necesito para conectar dos redes por fibra?" | `search_catalog` (DSL con medio/PoE) |
| Generación de diagramas | "topología con dos switches, un router y cuatro hosts" | `build_topology` (roles → dispositivos reales) |
| Explicación técnica | "¿qué es un switch multilayer?" | `get_device` + `search_catalog`, marcada "explicación generada" |
| Diagnóstico | "¿qué dispositivo convierte esta interfaz?" | `search_catalog` por medio/interfaz |
| Comparación inteligente | "¿alternativa moderna al Catalyst 9300?" | `successors` + `find_compatible` |

## Evaluación (criterio F7, §21.3)

- **Conjunto de oro**: `construirConjuntoOroDesdeDataset` genera preguntas
  verificables desde el propio dataset (puertos, capas, assertions numéricas,
  fabricante) + escenarios curados (NET-HW-060).
- **Oráculo**: `crearOracleSqlite` comprueba cada cita contra las tablas
  (assertion/relationship/device/port/osi_profile).
- **Umbral de despliegue**: citas correctas ≥ 95% **y** alucinaciones de specs
  = 0. `pnpm data:ia --eval` solo autoriza si los cumple.
- Comando de consola: `pnpm data:ia "pregunta"` para consultar el seed real.

## Frontera (futuro)

- Embeddings ONNX/sqlite-vec en el navegador (el contrato `SearchIndex` ya es
  opaco; el ranking híbrido TF-IDF actual es la implementación local).
- Proveedor LLM cloud opcional tras el flag (la etapa [1] de comprensión es
  sustituible manteniendo el puerto).
- Extracción asistida de datasheets con human-in-the-loop (§19, F6→F7).