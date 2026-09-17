# NetAtlas Image Finder

Busca fotos de producto para las fichas del catálogo y las deja en un staging
revisable. **No escribe nada en el seed por su cuenta.**

## Requisitos

- Node.js 18+ (usa `fetch` nativo)
- `ffmpeg` en el PATH (normalización a webp)
- Variable de entorno `BRAVE_API_KEY` (**nunca en el código**)

```powershell
# persistente, a nivel de tu usuario de Windows
[Environment]::SetEnvironmentVariable('BRAVE_API_KEY','<tu key>','User')
```

## Principio de diseño

Sólo se buscan **fichas con `model` real**. Las fichas de
`devices-generated.json` no tienen modelo ni SKU: son esqueletos estructurales
cuyo nombre ("Dell Technologies IOT 376") no corresponde a ningún producto
existente. Buscarles una foto devuelve imágenes de otro equipo y contamina el
catálogo, así que el script las descarta y las reporta en el plan.

Regla de oro: **la foto debe mostrar el modelo exacto**. Si no se consigue, la
ficha se queda sin foto. Nunca se rellena con una imagen genérica del
fabricante — eso fue exactamente el error de la primera pasada, que repartió 30
fotos genéricas entre 184 fichas.

## Uso

```bash
# 1. Plan: qué se va a buscar. No gasta ninguna query.
node tools/image-finder/image-finder.mjs --dry-run

# 2. Descubrir URLs candidatas (consume presupuesto de Brave)
node tools/image-finder/image-finder.mjs --phase 1

# 3. REVISAR staging-urls.json (y las imágenes de .tmp/): la foto, ¿es el modelo?
node tools/image-finder/image-finder.mjs --phase 2
node tools/image-finder/image-finder.mjs --phase 3

# 4. Revisar de nuevo .tmp/ y confirmar. Recién ahí:
node tools/image-finder/merge-images.mjs            # simulación
node tools/image-finder/merge-images.mjs --apply    # escribe seed + copia assets

# 5. Verificar
pnpm --filter @netatlas/dataset-tools run dataset:build
pnpm --filter @netatlas/dataset-tools run data:lint
pnpm test
```

Opciones: `--limit N` (tope de queries, por defecto 45 de las 50/mes del tier
gratuito), `--only=slug,slug` (limitar a fichas puntuales).

## Fases

| Fase | Qué hace | Salida |
|---|---|---|
| 1 | Brave Image Search, una query por modelo; descarta SVG y candidatas menores a 400×300 | `staging-urls.json` |
| 2 | Descarga y normaliza a webp (máx. 1200 px); descarta archivos < 5 KB y webp final < 8 KB | `staging-downloaded.json` + `.tmp/` |
| 3 | Arma el staging con las aceptadas y las rechazadas con su motivo | `staging-images.json` |
| merge | Copia el asset a `public/assets/img/` y aplica seed + fuentes. Match por slug exacto, exige ficha con `model` y sin foto previa | `devices.json`, `sources.json` |

## Por qué los umbrales de tamaño

En la primera pasada entraron 18 archivos de menos de 3 KB (logos, iconos y
miniaturas) y 87 fichas los mostraban. Los filtros de tamaño y formato del
pipeline son la barrera que impide que vuelva a pasar.

## Overrides de query

`curated-missing.json` permite fijar a mano la query de una ficha concreta
(cuando el nombre del modelo es ambiguo, o cuando la ficha es un producto real
que todavía no tiene `model` cargado). El override se aplica por slug.

## Atribución

Cada foto genera su propia fuente (`<slug>-photo-web`, tipo `terceros`,
autoridad 3) con la URL de la página de origen de la imagen, de modo que la
procedencia quede trazable desde la ficha.
