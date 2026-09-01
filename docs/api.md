# API pública de NetAtlas — OpenAPI, claves y rate limit (sección 31.3 / F8B)

> Fuente normativa: PLAN MAESTRO §31.3 y §27 F8B. Estado: **implementada**.
> Spec servida en `GET /openapi.json` (OpenAPI 3.1) por `@netatlas/server`.

## Criterio de la fase

> **Terceros consumen la API con clave.** (F8B, NET-HW-065/064)

## Autenticación

Toda ruta `/v1/*` requiere una **clave API** con formato `na_…`:

```http
Authorization: Bearer na_AbCdEf123456
# o el header alternativo:
X-Api-Key: na_AbCdEf123456
```

- La clave se emite por el administrador del servidor (ruta interna de gestión;
  el servidor **solo almacena el hash SHA-256**, nunca el secreto — §22.2).
- Sin clave o con clave inválida → `401` + `WWW-Authenticate: Bearer`.
- Por defecto, el perfil del consumidor se crea automáticamente como `reader`.
- `GET /openapi.json` es público (documentación).

## Endpoints `/v1`

| Método | Ruta | Descripción | Clave |
|---|---|---|---|
| GET | `/v1/devices/{slug}` | Ficha plana del dispositivo (404 si no existe) | sí |
| GET | `/v1/search?q=&limit=` | Búsqueda DSL/texto libre (§12.2), score opaco | sí |
| GET | `/v1/categories` | Catálogo cerrado de categorías | sí |
| GET | `/v1/snapshot?since=N` | Dispositivos desde la versión N (réplica/sync) | sí |
| GET | `/v1/me` | Perfil del consumidor | sí |
| GET | `/v1/favorites` | Favoritos del consumidor | sí |
| POST | `/v1/favorites` | Añade favorito `{entidad: "device:slug"}` (validada) | sí |
| DELETE | `/v1/favorites?entidad=device:slug` | Quita favorito | sí |

## Rate limiting

- Ventana deslizante por clave en memoria (límite configurable por
  `NETATLAS_RATE`, default 120/min).
- Al superarlo → `429` + header `Retry-After` (segundos).

## Auditoría

Cada petición autenticada se registra (`netatlas_api_audit`): prefijo de clave,
endpoint y estado. La auditoría nunca tira la petición por fallo de registro.

## Ejemplo (curl)

```bash
# 1. Emitir clave (gestión admin) — el servidor devuelve el secreto UNA vez
curl -X POST http://127.0.0.1:8787/v1/keys -H 'Authorization: Bearer <token-admin>'

# 2. Consultar como tercero
curl http://127.0.0.1:8787/v1/devices/cisco-catalyst-9300-48p \
     -H 'Authorization: Bearer na_…'

# 3. Favorito
curl -X POST http://127.0.0.1:8787/v1/favorites \
     -H 'Authorization: Bearer na_…' -H 'content-type: application/json' \
     -d '{"entidad":"device:cisco-catalyst-9300-48p"}'
```

## Frontera (F8B puro, futuro)

- Despliegue real: HTTPS + proxy, CDN de activos y conjuntos de datos firmados
  descargables.
- Rate limit compartido multi-nodo (hoy in-memory por instancia).
- AuthN OIDC para consumidores humanos + roles curator/reviewer (hoy el sync
  interno ya valida JWT RS256).
- Perfiles y favoritos sincronizados desde la PWA vía `/v1/favorites` con el
  cluso de F8A (el contrato de datos en el dominio es el mismo).