import type { InMemoryDataset } from './in-memory-tipos.js'
import type { UiAttributeDefinition, UiAttributesRepo, UiDeviceAttributeValue, UiFacetCount } from './in-memory-tipos.js'

/** Adaptador EAV in-memory (F3): facetas dinámicas y pestaña Capacidades. */
export class InMemoryAttributesRepository implements UiAttributesRepo {
  constructor(private readonly data: InMemoryDataset) {}

  async attributeDefinitionsByCategory(code: string): Promise<readonly UiAttributeDefinition[]> {
    const ancestros = this.ancestors(code)
    return (this.data.attributeDefinitions ?? []).filter((d) => ancestros.includes(d.categoryCode))
  }

  async attributeValuesForDevice(slug: string): Promise<readonly UiDeviceAttributeValue[]> {
    const defs = new Map((this.data.attributeDefinitions ?? []).map((d) => [d.key, d]))
    return (this.data.deviceAttributeValues ?? [])
      .filter((v) => v.deviceSlug === slug)
      .map((v) => {
        const def = defs.get(v.key)
        return {
          key: v.key,
          labelEs: def?.labelEs ?? v.key,
          valueType: def?.valueType ?? 'text',
          unit: def?.unit,
          display: v.display,
        }
      })
  }

  async facetCounts(categoryCode: string, key: string): Promise<readonly UiFacetCount[]> {
    const sub = this.subtree(categoryCode)
    const defs = await this.attributeDefinitionsByCategory(categoryCode)
    if (!defs.some((d) => d.key === key && d.isFacet)) return []
    const counts = new Map<string, number>()
    for (const v of this.data.deviceAttributeValues ?? []) {
      const dev = this.data.devices.find((d) => d.slug.value === v.deviceSlug)
      if (!dev || !sub.includes(dev.categoryCode)) continue
      if (v.key !== key || v.display === '—') continue
      counts.set(v.display, (counts.get(v.display) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  async filterByFacetValues(
    categoryCode: string,
    facets: Readonly<Record<string, readonly string[]>>,
  ): Promise<readonly string[]> {
    const keys = Object.keys(facets).filter((k) => (facets[k]?.length ?? 0) > 0)
    const porDispositivo = this.agruparPorDispositivo(this.subtree(categoryCode))
    const cumple = (grupo: Map<string, Set<string>>): boolean =>
      keys.every((k) => {
        const candidatos = grupo.get(k)
        if (!candidatos || candidatos.size === 0) return false
        return [...candidatos].some((val) => (facets[k] ?? []).includes(val))
      })
    return [...porDispositivo.entries()]
      .filter(([, grupo]) => cumple(grupo))
      .map(([slug]) => slug)
      .sort()
  }

  /** Valores EAV de cada dispositivo del subárbol, agrupados por clave (solo facetas). */
  private agruparPorDispositivo(sub: readonly string[]): Map<string, Map<string, Set<string>>> {
    const porDispositivo = new Map<string, Map<string, Set<string>>>()
    const defs = new Map((this.data.attributeDefinitions ?? []).map((d) => [d.key, d]))
    for (const v of this.data.deviceAttributeValues ?? []) {
      const dev = this.data.devices.find((d) => d.slug.value === v.deviceSlug)
      if (!dev || !sub.includes(dev.categoryCode)) continue
      const def = defs.get(v.key)
      if (def && !def.isFacet) continue
      let grupo = porDispositivo.get(v.deviceSlug)
      if (!grupo) {
        grupo = new Map()
        porDispositivo.set(v.deviceSlug, grupo)
      }
      let vals = grupo.get(v.key)
      if (!vals) {
        vals = new Set()
        grupo.set(v.key, vals)
      }
      vals.add(v.display)
    }
    return porDispositivo
  }

  /** Categoría y todos sus ancestros (para definiciones heredadas). */
  private ancestors(code: string): string[] {
    const out: string[] = []
    let current: string | undefined = code
    let guard = 0
    while (current !== undefined && guard++ < 32) {
      out.push(current)
      const cat = this.data.categories.find((c) => c.code === current)
      current = cat?.parentCode
    }
    return out
  }

  /** Categoría y todos sus descendientes (subárbol para facetas). */
  private subtree(code: string): string[] {
    const out = [code]
    const stack = [code]
    for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
      for (const c of this.data.categories) {
        if (c.parentCode === current) {
          out.push(c.code)
          stack.push(c.code)
        }
      }
    }
    return out
  }
}
