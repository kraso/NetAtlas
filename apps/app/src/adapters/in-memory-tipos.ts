import type { Device, Manufacturer, Category, Relationship, Assertion, Source, Topology, Datasheet, DeviceImage } from '@netatlas/domain'

/**
 * Tipos del adaptador in-memory (F1 UI): dataset de demostración y contratos de
 * vista (EAV, subgrafo del mapa, topologías). Sin lógica: solo la forma de los
 * datos que consumen los repositorios de `in-memory-*.ts`.
 */

export interface InMemoryDataset {
  readonly devices: readonly Device[]
  readonly manufacturers: readonly Manufacturer[]
  readonly categories: readonly Category[]
  readonly relationships: readonly Relationship[]
  readonly assertions: readonly Assertion[]
  readonly sources: readonly Source[]
  readonly protocols?: readonly { code: string; name: string; family: string; osiLayer: number }[]
  readonly standards?: readonly { org: string; identifier: string; title: string }[]
  readonly media?: readonly { code: string; kind: string; name: string; maxSpeedMbps?: number }[]
  /** EAV demo (F3): definiciones de atributo por categoría. */
  readonly attributeDefinitions?: readonly InMemoryAttributeDefinition[]
  /** EAV demo (F3): valores por dispositivo. */
  readonly deviceAttributeValues?: readonly InMemoryDeviceAttributeValue[]
  /** Topologías demo (F4 §13.3). */
  readonly topologies?: readonly Topology[]
  /** Datasheets por dispositivo (F2-Documentación). */
  readonly datasheets?: readonly Datasheet[]
  /** Imágenes por dispositivo (foto en Resumen, F2-Fotos). */
  readonly images?: readonly DeviceImage[]
}

/** Contrato de atributos (EAV §9.4) para las vistas — sin acoplar a @netatlas/data. */
export interface UiAttributeDefinition {
  readonly key: string
  readonly labelEs: string
  readonly valueType: 'number' | 'text' | 'enum' | 'bool' | 'range'
  readonly unit?: string
  readonly enumValues?: readonly string[]
  readonly isFacet: boolean
  readonly isComparable: boolean
  readonly compareRule: 'higher-better' | 'lower-better' | 'set-compare' | 'none'
}

/** Valor EAV de un dispositivo (pestaña Capacidades). */
export interface UiDeviceAttributeValue {
  readonly key: string
  readonly labelEs: string
  readonly valueType: UiAttributeDefinition['valueType']
  readonly unit?: string
  readonly display: string
}

/** Conteo de una faceta dinámica (valor → cuántos dispositivos). */
export interface UiFacetCount {
  readonly value: string
  readonly count: number
}

/** Nodo del subgrafo local para el mapa (NET-HW-030). */
export interface UiGraphNode {
  readonly id: string
  readonly type: string
  readonly label: string
}

/** Arista del subgrafo local (dirección subject → object normalizada). */
export interface UiGraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly predicate: string
}

/** Subgrafo local de un nodo: nodos + aristas + predicados presentes. */
export interface UiGraphSubgraph {
  readonly nodes: readonly UiGraphNode[]
  readonly edges: readonly UiGraphEdge[]
  readonly predicates: readonly { code: string; count: number }[]
}

export interface UiAttributesRepo {
  attributeDefinitionsByCategory(code: string): Promise<readonly UiAttributeDefinition[]>
  attributeValuesForDevice(slug: string): Promise<readonly UiDeviceAttributeValue[]>
  facetCounts(categoryCode: string, key: string): Promise<readonly UiFacetCount[]>
  filterByFacetValues(categoryCode: string, facets: Readonly<Record<string, readonly string[]>>): Promise<readonly string[]>
}

export interface InMemoryAttributeDefinition extends UiAttributeDefinition {
  readonly categoryCode: string
}

export interface InMemoryDeviceAttributeValue {
  readonly deviceSlug: string
  readonly key: string
  readonly display: string
}

/** Contrato de topologías (F4 §13.3): visor + persistencia de layout + laboratorio. */
export interface UiTopologyRepo {
  list(): Promise<readonly Topology[]>
  bySlug(slug: string): Promise<Topology | undefined>
  upsert(topology: Topology): Promise<void>
  saveLayout(slug: string, positions: ReadonlyArray<{ nodeId: string; x: number; y: number }>): Promise<void>
  remove(slug: string): Promise<void>
}
