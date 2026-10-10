import type { InMemoryDataset } from './in-memory.js'
import type { SnapshotBody } from './http-ui-tipos.js'
import {
  construirAfirmaciones,
  construirEav,
  construirFichas,
  construirFuentes,
  construirImagenes,
  construirRelaciones,
  derivarCatalogo,
  toDevice,
} from './http-ui-piezas.js'

/**
 * Ensambla el `InMemoryDataset` (F8B) a partir del snapshot del API: mapea los
 * dispositivos, deriva el catálogo y adjunta relaciones, afirmaciones, valores
 * EAV, fichas e imágenes. Vive aparte de `http-ui.ts` para que ese módulo
 * conserve pocos imports y una fachada corta.
 */
export function construirDataset(
  body: SnapshotBody,
  categoriasApi: readonly { code: string; nameEs: string; parentCode?: string }[],
): InMemoryDataset {
  const detPorSlug = new Map((body.detalle?.devices ?? []).map((d) => [d.slug, d]))
  const dispositivos = (body.dispositivos ?? []).map((sd) => toDevice(sd, detPorSlug.get(sd.slug)))
  const { manufacturers, categories } = derivarCatalogo(dispositivos, categoriasApi, body.detalle?.catalogs.manufacturers)
  const known = new Set(dispositivos.map((d) => d.slug.value))

  const fuentes = construirFuentes(body)
  const catalogs = body.detalle?.catalogs
  const { attributeDefinitions, deviceAttributeValues } = construirEav(body, known)

  return {
    devices: dispositivos,
    manufacturers,
    categories,
    relationships: construirRelaciones(body, known),
    assertions: construirAfirmaciones(dispositivos, detPorSlug, fuentes),
    sources: [...fuentes.values()],
    protocols: (catalogs?.protocols ?? []).map((p) => ({ ...p })),
    standards: (catalogs?.standards ?? []).map((s) => ({ ...s })),
    media: (catalogs?.media ?? []).map((m) => ({ ...m })),
    attributeDefinitions,
    deviceAttributeValues,
    datasheets: construirFichas(dispositivos, detPorSlug, fuentes),
    images: construirImagenes(dispositivos, detPorSlug, fuentes),
  }
}