import type { SyncAssertion, SyncAttributeValue, SyncDatasheet, SyncDeviceRelation, SyncImage, SyncPort } from '@netatlas/domain'
import type {
  AfirmacionRow,
  CapaRow,
  DispositivoRow,
  EstandarRow,
  FabricanteRow,
  FilasSnapshot,
  FuenteRow,
  MedioRow,
  ProtocoloRow,
  SnapshotDetail,
} from './sqlite-snapshot-tipos.js'
import {
  agruparAfirmaciones,
  agruparDatasheets,
  agruparImagenes,
  agruparPuertos,
  agruparRelaciones,
  agruparValores,
  mostrarValor,
  parsearEnumJson,
} from './sqlite-snapshot-mapeo-logica.js'

/**
 * Mapeo de las filas del snapshotDetail (F8B-detalle) al contrato de dominio
 * `SnapshotDetail`: agrupación por dispositivo (puertos, relaciones,
 * assertions, imágenes, fichas, valores EAV) + catálogos y fuentes.
 *
 * La lógica de agrupación está en `sqlite-snapshot-mapeo-logica.ts`.
 */

/** Reexporta `mostrarValor` para compatibilidad con imports existentes. */
export { mostrarValor }

/**
 * Construye el `SnapshotDetail` a partir de las filas crudas del snapshot.
 *
 * Delega cada agrupación a funciones auxiliares en
 * `sqlite-snapshot-mapeo-logica.ts` y ensambla el resultado final.
 */
export function construirSnapshotDetail(filas: FilasSnapshot): SnapshotDetail {
  const grupos = agruparFilas(filas)
  return {
    devices: filas.dispositivos.map((d) => dispositivoMapeado(d, grupos)),
    catalogs: construirCatalogos(filas.protocolos, filas.estandares, filas.medios, filas.capas, filas.fabricantes),
    sources: filas.fuentes.map((s) => ({
      slug: s.slug, kind: s.kind, publisher: s.publisher ?? undefined, title: s.title,
      url: s.url ?? undefined, retrievedOn: s.retrieved_on ?? undefined, authorityLevel: Number(s.authority_level),
    })),
    attributeDefinitions: filas.definiciones.map((d) => ({
      key: d.key, labelEs: d.label_es, valueType: d.value_type, unit: d.unit ?? undefined,
      enumValues: parsearEnumJson(d.enum_json),
      isFacet: Number(d.is_facet) === 1, isComparable: Number(d.is_comparable) === 1,
      compareRule: d.compare_rule, categoryCode: d.category_code,
    })),
  }
}

/** Agrupaciones por dispositivo que consume el mapeo de `devices`. */
interface GruposPorDispositivo {
  puertos: Map<string, SyncPort[]>
  relaciones: Map<string, SyncDeviceRelation[]>
  afirmaciones: Map<string, SyncAssertion[]>
  imagenes: Map<string, SyncImage[]>
  fichas: Map<string, SyncDatasheet[]>
  valores: Map<string, SyncAttributeValue[]>
}

/** Agrupa las filas hijas por dispositivo en una sola pasada de helpers. */
function agruparFilas(filas: FilasSnapshot): GruposPorDispositivo {
  return {
    puertos: agruparPuertos(filas.puertos),
    relaciones: agruparRelaciones(filas.relaciones),
    afirmaciones: agruparAfirmaciones(filas.afirmaciones),
    imagenes: agruparImagenes(filas.imagenes),
    fichas: agruparDatasheets(filas.fichas),
    valores: agruparValores(filas.valores),
  }
}

/** Mapea un dispositivo con sus colecciones ya agrupadas. */
function dispositivoMapeado(d: DispositivoRow, g: GruposPorDispositivo) {
  return {
    slug: d.slug,
    summary: d.summary ?? undefined,
    osiProfileJson: d.osi_profile_json ?? undefined,
    ports: g.puertos.get(d.slug) ?? [],
    relations: g.relaciones.get(d.slug) ?? [],
    assertions: g.afirmaciones.get(d.slug) ?? [],
    attributeValues: (g.valores.get(d.slug) ?? []).map((v) => ({ key: v.key, display: v.display })),
    datasheets: g.fichas.get(d.slug) ?? [],
    images: g.imagenes.get(d.slug) ?? [],
  }
}

/** Construye el catálogo (protocolos, estándares, medios, capas, fabricantes). */
function construirCatalogos(protocolos: readonly ProtocoloRow[], estandares: readonly EstandarRow[], medios: readonly MedioRow[], capas: readonly CapaRow[], fabricantes: readonly FabricanteRow[]) {
  return {
    protocols: protocolos.map((p) => ({ code: p.code, name: p.name, family: p.family, osiLayer: Number(p.osi_layer) })),
    standards: estandares.map((s) => ({ org: s.org, identifier: s.identifier, title: s.title })),
    media: medios.map((m) => ({ code: m.code, kind: m.kind, name: m.name, maxSpeedMbps: m.max_speed_mbps !== null ? Number(m.max_speed_mbps) : undefined })),
    layers: capas.map((l) => ({ number: Number(l.number), nameEs: l.name_es })),
    manufacturers: fabricantes.map((m) => ({
      slug: m.slug,
      snmpEnterprise: m.snmp_enterprise !== null ? Number(m.snmp_enterprise) : undefined,
    })),
  }
}
