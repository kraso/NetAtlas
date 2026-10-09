import type { Device } from '@netatlas/domain'
import type { ToolContext } from '@netatlas/domain'
import type { InMemoryDataset } from './in-memory-tipos.js'

// ── Asistente IA demo (F7 §21): ToolContext sobre el dataset de demostración ─

/** Valor JSON legible para el contexto del asistente. */
function valorJsonLegible(valueJson: string): string {
  try {
    const v = JSON.parse(valueJson) as unknown
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'sí' : 'no'
    if (typeof v === 'string') return v
    return String(v)
  } catch {
    return valueJson
  }
}

export class ToolContextDemo implements ToolContext {
  constructor(private readonly data: InMemoryDataset) {}

  async searchCatalog(dsl: string, limit: number): Promise<{ slug: string; nombre: string; categoria: string }[]> {
    const q = dsl.trim().toLowerCase()
    const devs = this.data.devices.filter(
      (d) => q.length === 0 || d.name.toLowerCase().includes(q) || d.slug.value.includes(q) || d.categoryCode.toLowerCase().includes(q),
    )
    const catName = new Map(this.data.categories.map((c) => [c.code, c.nameEs]))
    return devs.slice(0, limit).map((d) => ({ slug: d.slug.value, nombre: d.name, categoria: catName.get(d.categoryCode) ?? d.categoryCode }))
  }

  async getDevice(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const d = this.data.devices.find((x) => x.slug.value === slug || x.slug.value === slug.replace('-c9300-', '-c9300-'))
    if (!d) {
      // Aliases del demo: el nombre comercial puede diferir del slug.
      const porNombre = this.data.devices.find((x) => x.name.toLowerCase().includes(slug.toLowerCase().replace('-', ' ')))
      if (!porNombre) return undefined
      return this.ficha(porNombre)
    }
    return this.ficha(d)
  }

  private ficha(d: Device): Readonly<Record<string, unknown>> {
    const idx = this.data.devices.findIndex((x) => x.slug.value === d.slug.value) + 1
    const assertions = this.data.assertions
      .filter((a) => a.subjectId === idx)
      .map((a) => ({ predicado: a.predicate, valor: valorJsonLegible(a.valueJson), fuenteSlug: a.source.slug, fuenteTitulo: a.source.title }))
    const catName = this.data.categories.find((c) => c.code === d.categoryCode)?.nameEs ?? d.categoryCode
    const mfr = this.data.manufacturers.find((m) => m.slug.value === d.manufacturerSlug)?.name ?? d.manufacturerSlug
    const totalPorts = d.ports.reduce((acc, p) => acc + p.quantity, 0)
    return {
      slug: d.slug.value,
      nombre: d.name,
      fabricante: mfr,
      categoria: catName,
      lanza: d.releasedOn?.slice(0, 4),
      puertos: d.ports.map((p) => ({ label: p.label, cantidad: p.quantity, speeds: p.speedsMbps })),
      assertions,
      totalPuertos: totalPorts,
    }
  }

  async compareDevices(ids: string[]): Promise<Readonly<Record<string, unknown>>> {
    const filas: { clave: string; labelEs: string; valores: Record<string, string> }[] = []
    const dispositivos: { slug: string; nombre: string }[] = []
    const valores = (this.data.deviceAttributeValues ?? []).filter((v) => ids.includes(v.deviceSlug))
    const defs = new Map((this.data.attributeDefinitions ?? []).map((d) => [d.key, d]))
    const claves = new Set(valores.map((v) => v.key))
    for (const clave of claves) {
      const cell: Record<string, string> = {}
      for (const id of ids) {
        const v = valores.find((x) => x.deviceSlug === id && x.key === clave)
        cell[id] = v?.display ?? '—'
      }
      filas.push({ clave, labelEs: defs.get(clave)?.labelEs ?? clave, valores: cell })
    }
    for (const id of ids) {
      const d = this.data.devices.find((x) => x.slug.value === id)
      if (d) dispositivos.push({ slug: id, nombre: d.name })
    }
    return { dispositivos, diferencias: filas }
  }

  async findCompatible(device: string, _constraint: string | undefined): Promise<Readonly<Record<string, unknown>>> {
    const aristas = this.data.relationships.filter(
      (r) =>
        (r.predicate === 'similar-to' || r.predicate === 'compatible-with') &&
        ((r.subject.type === 'device' && r.subject.slug === device) || (r.object.type === 'device' && r.object.slug === device)),
    )
    const compatibles: { slug: string; nombre: string; via: string }[] = []
    for (const r of aristas) {
      const peer = r.subject.type === 'device' && r.subject.slug === device ? r.object : r.subject
      if (peer.type !== 'device') continue
      const d = this.data.devices.find((x) => x.slug.value === peer.slug)
      if (d) compatibles.push({ slug: peer.slug, nombre: d.name, via: r.predicate })
    }
    return { dispositivo: device, compatibles }
  }

  async buildTopology(spec: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    // Demo simplificado: usa la primera topología de referencia si no hay roles.
    const nombre = String(spec.name ?? 'Topología IA')
    const demo = this.data.topologies?.find((t) => t.slug.value === 'clos-demo')
    if (!demo) return { error: 'No hay topología demo disponible.' }
    return { slug: demo.slug.value, nombre: demo.name, nodos: demo.nodes.length, enlaces: demo.edges.length }
  }

  async whatLayers(slug: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const d = this.data.devices.find((x) => x.slug.value === slug)
    if (!d || !d.osiProfile) return undefined
    return { slug, nombre: d.name, termina: d.osiProfile.profile.terminate, transparente: d.osiProfile.profile.transparent }
  }

  async successors(slug: string): Promise<{ relacion: string; slug: string; nombre: string }[]> {
    const aristas = this.data.relationships.filter((r) => r.subject.type === 'device' && r.subject.slug === slug && ['replaced-by', 'succeeds', 'precedes'].includes(r.predicate))
    return aristas.flatMap((r) => {
      if (r.object.type !== 'device') return []
      const d = this.data.devices.find((x) => x.slug.value === r.object.slug)
      return d ? [{ relacion: r.predicate, slug: d.slug.value, nombre: d.name }] : []
    })
  }
}
