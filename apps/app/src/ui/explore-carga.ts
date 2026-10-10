import type { Device } from '@netatlas/domain'
import type {
  AppServices,
  UiAttributeDefinition,
  UiFacetCount,
} from '../composition-root.js'

/**
 * Carga de datos del Explorador (§10.4), extraída del componente para que
 * `Explore` solo orqueste estado y render: resultados por categoría/consulta,
 * facetas dinámicas EAV (F3) y filtro por facetas.
 */

/** Faceta dinámica derivada de las definiciones de categoría (F3 / NET-HW-029-EAV). */
export interface FacetaUI {
  readonly key: string
  readonly labelEs: string
  readonly valueType: UiAttributeDefinition['valueType']
  readonly unit?: string
  readonly enumValues?: readonly string[]
  readonly conteos: readonly UiFacetCount[]
}

/**
 * Resultados del explorador: los dispositivos de la categoría seleccionada
 * (hasta 200) o los resueltos desde la consulta DSL (50 hits → dispositivos).
 */
export async function cargarResultados(
  svc: Pick<AppServices, 'devices' | 'search'>,
  selectedCat: string | null,
  query: string,
): Promise<readonly Device[]> {
  if (selectedCat) {
    const page = await svc.devices.listByCategory(selectedCat, { limit: 200 })
    return page.items
  }
  if (!query) return []
  const res = await svc.search.query({ rawQuery: query, limit: 50 })
  const slugs = res.hits.map((h: { slug: string }) => h.slug)
  const found: Device[] = []
  for (const s of slugs) {
    const d = await svc.devices.findBySlug(s)
    if (d) found.push(d)
  }
  return found
}

/** Facetas con conteos de la categoría seleccionada (solo atributos facetados). */
export async function cargarFacetas(
  svc: Pick<AppServices, 'attributes'>,
  selectedCat: string,
): Promise<readonly FacetaUI[]> {
  const defs = await svc.attributes.attributeDefinitionsByCategory(selectedCat)
  const conConteos: FacetaUI[] = []
  for (const d of defs.filter((d) => d.isFacet)) {
    const conteos = await svc.attributes.facetCounts(selectedCat, d.key)
    if (conteos.length > 0) {
      conConteos.push({
        key: d.key,
        labelEs: d.labelEs,
        valueType: d.valueType,
        unit: d.unit,
        enumValues: d.enumValues,
        conteos,
      })
    }
  }
  return conConteos
}

/** Slugs que superan el filtro de facetas activas sobre la categoría (F3). */
export async function filtrarPorFacetas(
  svc: Pick<AppServices, 'attributes'>,
  selectedCat: string,
  seleccion: Readonly<Record<string, readonly string[]>>,
): Promise<ReadonlySet<string>> {
  const slugs = await svc.attributes.filterByFacetValues(selectedCat, seleccion)
  return new Set(slugs)
}
