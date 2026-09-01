# Sincronización de NetAtlas — servidor, réplica offline y outbox (sección 23.4 / F8A)

> Fuente normativa: PLAN MAESTRO §23.4, §6.7 y §27 (F8A). Estado: **implementada**.
> Paquete: `@netatlas/server` + módulo de dominio `packages/domain/src/sync/`.

## Arquitectura (§23.4[3], sin reescritura)

```
App offline (SQLite local)                    Servidor (SQLite o PostgreSQL)
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ netatlas_outbox (cola)       │──push──────▶│ POST /api/contributions      │
│  notas / propuestas          │  (Bearer)    │  (LWW por revisión)          │
│ netatlas_replica (caché)     │◀─pull───────│ GET /api/snapshot?since=N    │
└──────────────────────────────┘              └──────────────────────────────┘
```

- **Dominio** (`sync/sincronizacion.ts`): `sincronizar()` es puro — pull del
  snapshot (LWW por versión) y push de la cola outbox confirmado. Sin red,
  pull y push fallan **blandamente**: la cola permanece intacta (nunca se
  borra sin confirmación del servidor) y la réplica conserva su versión.
- **Adaptadores SQLite** (`packages/data/src/sync/`): tablas
  `netatlas_outbox`/`netatlas_replica` runtime-only — **FUERA del manifiesto
  firmado** (§22.4: datos de usuario ≠ dataset publicado). Idempotentes al
  primer uso; no son migración numerada del dataset.
- **Servidor** (`packages/server/`): API REST sobre `node:http` sin
  dependencias; `ServidorStore` es el contrato que SQLite y PostgreSQL
  implementan por igual (§6.7: cambiar de motor no toca dominio ni vistas).

## Endpoints de la API

| Endpoint | Auth | Descripción |
|---|---|---|
| `GET /api/health` | — | Estado + versión del servidor |
| `GET /api/device/:slug` | — | Ficha plana (404 si no existe) |
| `GET /api/search?q=&limit=` | — | Búsqueda DSL/texto libre (hits+score opaco) |
| `GET /api/categories` | — | Catálogo cerrado de categorías |
| `GET /api/snapshot?since=N` | — | Dispositivos desde la versión N (réplica) |
| `POST /api/contributions` | Bearer | Recibe el outbox; devuelve ids aceptados |

## Autenticación (NET-HW-062, §22.5)

- **Bearer estático**: `NETATLAS_SERVER_TOKEN` (despliegue de un admin).
- **OIDC**: `NETATLAS_OIDC_ISSUER/JWKS/AUDIENCE` — valida JWT **RS256** contra
  el JWKS remoto (caché), con exp/iat/aud/iss. Sin librerías: `node:crypto`.

## Adaptador PostgreSQL

`NETATLAS_PG=postgres://…` (o `--pg=…`) cambia el almacén a
`PostgresServidorStore` (SQL $1…, schema `netatlas`, `ON CONFLICT DO UPDATE`).
El contrato es idéntico al SQLite; en CI se prueba con un driver doble que
verifica el SQL generado, igual que el plan pide sin tocar `packages/domain`
ni las vistas (§6.7, prueba ácida de la fase).

## Cómo se verifica (criterio F8A: "app funciona offline y sincroniza")

`packages/server/test/sync-criterio.test.ts` levanta un servidor HTTP real
sobre una copia del seed (330 dispositivos):

1. **Offline**: fetch al servidor caído → las contribuciones quedan en la cola
   (0 perdidas, 0 enviadas, pendientes intactas).
2. **Recupera la red**: `sincronizar()` trae el snapshot (réplica con 330
   dispositivos) y empuja la cola → 2/2 confirmadas, cola vacía.
3. **Seguridad**: sin token → 401 y la cola persiste.

## Uso

```bash
pnpm --filter @netatlas/server server            # SQLite + Bearer por default
NETATLAS_PG=postgres://… pnpm --filter @netatlas/server server   # PostgreSQL
NETATLAS_SERVER_TOKEN=mi-secreto pnpm --filter @netatlas/server server
```

## Frontera (F8B)

- OpenAPI + claves de API para terceros, perfiles y favoritos sincronizados
  (NET-HW-064/065).
- CRDT o merge por entidad en el servidor (hoy LWW por revisión de
  contribución).
- Réplica con subconjuntos por categoría/ámbito (§23.4).