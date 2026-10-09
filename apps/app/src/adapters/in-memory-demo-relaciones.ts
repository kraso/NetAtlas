import { Relationship, Topology } from '@netatlas/domain'
import type { Device, GraphNode } from '@netatlas/domain'


// ── Relaciones del dataset de demostración ──────────────────────────────────

type Acumulador = (from: string, predicate: string, toType: string, toSlug: string, fromType?: string) => void

/** Acumulador de aristas del demo (el sujeto por defecto es un dispositivo). */
function acumuladorDeRelaciones(relationships: Relationship[]): Acumulador {
  return (from, predicate, toType, toSlug, fromType = 'device'): void => {
    relationships.push(
      Relationship.create({
        subject: { type: fromType as GraphNode['type'], slug: from },
        predicate,
        object: { type: toType as GraphNode['type'], slug: toSlug },
        validFrom: '2020-01-01',
      }),
    )
  }
}

/** Fabricante y categoría de cada dispositivo. */
function relacionesBase(rel: Acumulador, devices: readonly Device[]): void {
  for (const d of devices) {
    rel(d.slug.value, 'manufactured-by', 'manufacturer', d.manufacturerSlug)
    rel(d.slug.value, 'has-category', 'category', d.categoryCode)
  }
}

/** Sucesión (historia): 2930F sucede a 2960X (mismo rol), 6300M sucede a 2930F. */
function relacionesHistoria(rel: Acumulador): void {
  rel('aruba-6300m-48g', 'succeeds', 'device', 'aruba-2930f-48g')
  rel('aruba-2930f-48g', 'precedes', 'device', 'aruba-6300m-48g')
  rel('cisco-c9300-48p', 'replaced-by', 'device', 'cisco-9120axi')
  // Similares (NET-HW-032): el 6300M y el 9300 son competidores de acceso L3
  rel('aruba-6300m-48g', 'similar-to', 'device', 'cisco-c9300-48p')
}

/** Tecnologías transversales (NET-HW-031): evolución PoE usa-technology. */
function relacionesTecnologia(rel: Acumulador): void {
  rel('poe-8023af', 'evolves-into', 'technology', 'poe-8023at', 'technology')
  rel('poe-8023at', 'evolves-into', 'technology', 'poe-8023bt', 'technology')
  rel('cisco-c9300-48p', 'uses-technology', 'technology', 'poe-8023at')
  rel('aruba-2930f-48g', 'uses-technology', 'technology', 'poe-8023at')
}

/** Soportes de protocolo declarados por el grafo. */
function relacionesProtocolos(rel: Acumulador): void {
  rel('cisco-c9300-48p', 'supports-protocol', 'protocol', 'ospf')
  rel('cisco-c9300-48p', 'supports-protocol', 'protocol', 'bgp')
  rel('cisco-c9300-48p', 'supports-protocol', 'protocol', 'vxlan')
  rel('aruba-6300m-48g', 'supports-protocol', 'protocol', 'ospf')
  rel('aruba-6300m-48g', 'supports-protocol', 'protocol', 'vxlan')
  rel('aruba-2930f-48g', 'supports-protocol', 'protocol', 'ospf')
  rel('mikrotik-ccr1036', 'supports-protocol', 'protocol', 'bgp')
  rel('mikrotik-ccr1036', 'supports-protocol', 'protocol', 'mpls')
  rel('fortinet-200f', 'supports-protocol', 'protocol', 'ipsec')
  rel('cisco-9120axi', 'supports-protocol', 'protocol', '802.11ax')
}

/** Estándares implementados y medios terminados. */
function relacionesEstandaresYMedios(rel: Acumulador): void {
  rel('cisco-c9300-48p', 'implements-standard', 'standard', 'ieee/802.3at')
  rel('aruba-2930f-48g', 'implements-standard', 'standard', 'ieee/802.3at')
  rel('mikrotik-ccr1036', 'terminates-medium', 'medium', 'smf-os2')
  rel('cisco-c9300-48p', 'terminates-medium', 'medium', 'utp-cat6a')
}

/** Aristas del dataset de demostración, en el orden original. */
export function demoRelaciones(devices: readonly Device[]): Relationship[] {
  const relationships: Relationship[] = []
  const rel = acumuladorDeRelaciones(relationships)
  relacionesBase(rel, devices)
  relacionesHistoria(rel)
  relacionesTecnologia(rel)
  relacionesProtocolos(rel)
  relacionesEstandaresYMedios(rel)
  return relationships
}


// ── Topologías del dataset de demostración (F4 §13.3) ───────────────────────

function topologiaClos(): Topology {
  return Topology.create({
    slug: 'clos-demo',
    name: 'Clos de demostración (L3)',
    kind: 'reference',
    nodes: [
      { entityType: 'device', entitySlug: 'mikrotik-ccr1036', x: 0, y: 120, layerHint: 3 },
      { entityType: 'device', entitySlug: 'cisco-c9300-48p', x: 100, y: 0, layerHint: 3 },
      { entityType: 'device', entitySlug: 'aruba-6300m-48g', x: 260, y: 0, layerHint: 3 },
      { entityType: 'device', entitySlug: 'fortinet-200f', x: 180, y: 120, layerHint: 4 },
      { entityType: 'device', entitySlug: 'aruba-2930f-48g', x: 360, y: 120, layerHint: 2 },
      { entityType: 'device', entitySlug: 'cisco-9120axi', x: 480, y: 120, layerHint: 1 },
    ],
    edges: [
      { from: 'device:mikrotik-ccr1036', to: 'device:cisco-c9300-48p', label: '1G' },
      { from: 'device:mikrotik-ccr1036', to: 'device:aruba-6300m-48g', label: '10G' },
      { from: 'device:cisco-c9300-48p', to: 'device:aruba-6300m-48g', label: '40G spine' },
      { from: 'device:cisco-c9300-48p', to: 'device:fortinet-200f', label: '10G' },
      { from: 'device:aruba-6300m-48g', to: 'device:aruba-2930f-48g', label: '1G' },
      { from: 'device:aruba-2930f-48g', to: 'device:cisco-9120axi', label: 'PoE+' },
    ],
  })
}

function topologiaSucursal(): Topology {
  return Topology.create({
    slug: 'sucursal-demo',
    name: 'Sucursal de demostración',
    kind: 'reference',
    nodes: [
      { entityType: 'device', entitySlug: 'mikrotik-ccr1036', x: 0, y: 0, layerHint: 3 },
      { entityType: 'device', entitySlug: 'aruba-2930f-48g', x: 200, y: 0, layerHint: 2 },
      { entityType: 'device', entitySlug: 'cisco-9120axi', x: 400, y: 0, layerHint: 1 },
      { entityType: 'category', entitySlug: 'CAT-WLS', x: 400, y: 120, layerHint: 1 },
    ],
    edges: [
      { from: 'device:mikrotik-ccr1036', to: 'device:aruba-2930f-48g', label: '1G' },
      { from: 'device:aruba-2930f-48g', to: 'device:cisco-9120axi', label: 'PoE+' },
      { from: 'device:cisco-9120axi', to: 'category:CAT-WLS', label: 'categoría' },
    ],
  })
}

function nodosVirtuales(): { entityType: 'device'; entitySlug: string; x: number; y: number }[] {
  const nodos: { entityType: 'device'; entitySlug: string; x: number; y: number }[] = []
  for (let i = 1; i <= 300; i++) {
    nodos.push({
      entityType: 'device',
      entitySlug: `virt-${String(i).padStart(4, '0')}`,
      x: ((i - 1) % 20) * 60,
      y: Math.floor((i - 1) / 20) * 60,
    })
  }
  return nodos
}

function aristasVirtuales(): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = []
  for (let i = 2; i <= 300; i++) {
    edges.push({ from: `device:virt-${String(i - 1).padStart(4, '0')}`, to: `device:virt-${String(i).padStart(4, '0')}` })
  }
  for (let i = 21; i <= 300; i += 25) {
    edges.push({ from: 'device:virt-0001', to: `device:virt-${String(i).padStart(4, '0')}` })
  }
  return edges
}

/** Topología de 300 nodos (solo para el SLO de diagramas §23.2 en E2E). */
function topologiaEstres(): Topology {
  return Topology.create({
    slug: 'estres-300',
    name: 'Estrés — 300 nodos (SLO de diagramas)',
    kind: 'reference',
    nodes: nodosVirtuales(),
    edges: aristasVirtuales(),
  })
}

export function demoTopologias(): Topology[] {
  return [topologiaClos(), topologiaSucursal(), topologiaEstres()]
}
