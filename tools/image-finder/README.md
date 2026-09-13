# NetAtlas Image Finder

Automatiza la búsqueda de fotos de producto para dispositivos del catálogo NetAtlas.

## Requisitos

- Node.js 18+ (fetch nativo)
- ffmpeg instalado y en PATH
- Brave Search API key (configurada como variable de entorno `BRAVE_API_KEY` o hardcodeada)
- **50 queries/mes** en tier gratuito de Brave

## Uso

```bash
# Ejecutar todas las fases
node tools/image-finder/image-finder.mjs

# Solo fase 1 (descubrir URLs)
node tools/image-finder/image-finder.mjs --phase 1

# Solo fase 2 (descargar, requiere staging-urls.json)
node tools/image-finder/image-finder.mjs --phase 2

# Solo fase 3 (generar staging, requiere staging-downloaded.json)
node tools/image-finder/image-finder.mjs --phase 3

# Dry run (mostrar queries sin ejecutar)
node tools/image-finder/image-finder.mjs --dry-run
```

## Pipeline

### Fase 1: Descubrimiento (Brave API)
- Genera queries para top 30 fabricantes × categoría principal
- Genera queries para 12 dispositivos curados sin imagen
- Límite: 42/50 queries del tier gratuito
- Output: `staging-urls.json`

### Fase 2: Descarga + Conversión
- Descarga imágenes desde URLs descubiertas
- Convierte a `.webp` con ffmpeg (quality 80)
- Copia a `apps/app/public/assets/img/{slug}-frontal.webp`
- Paralelo: 5 descargas simultáneas
- Output: `staging-downloaded.json`

### Fase 3: Generación de staging
- Genera `staging-images.json` con:
  - Entradas `images` listas para mergear en `devices.json` / `devices-generated.json`
  - Entradas `sources` para `sources.json` (deduplicadas)
  - Metadata completa (query, confidence, dimensions)

## Archivos generados

```
tools/image-finder/
├── image-finder.mjs          # Script principal
├── manufacturers.json         # Top 30 fabricantes
├── curated-missing.json       # 12 curados sin imagen
├── staging-urls.json          # Output fase 1
├── staging-downloaded.json    # Output fase 2
├── staging-images.json        # Output fase 3 (listo para merge)
└── README.md                  # Este archivo
```

## Flujo manual después del script

1. Revisar `staging-images.json`
2. Eliminar entradas con `confidence: low` o `confidence: none`
3. Verificar que las imágenes muestran el modelo correcto
4. Mergear `images` entries en `devices.json` / `devices-generated.json`
5. Mergear `sources` entries en `sources.json`
6. Ejecutar `dataset:build` → `data:lint` → `pnpm test`
7. Commit + push
