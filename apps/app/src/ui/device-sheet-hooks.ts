import React from 'react'
import { useServices } from '../composition-root.js'
import type { UiDeviceAttributeValue } from '../composition-root.js'
import { useCatalogStore } from '../viewmodels/catalog-store.js'
import type { Assertion, Datasheet, Device, DeviceImage, Manufacturer, Relationship } from '@netatlas/domain'

/**
 * Estado de la ficha resuelta por slug (§10.5). Se recarga con la revisión del
 * dataset para que el warmezo demo → remoto (F8B) no quede a medias.
 */
export interface EstadoDispositivo {
  readonly device: Device | undefined
  readonly notFound: boolean
}

export function useDeviceDeSlug(slug: string): EstadoDispositivo {
  const [device, setDevice] = React.useState<Device | undefined>()
  const [notFound, setNotFound] = React.useState(false)
  const revision = useServices((s) => s.revision)

  React.useEffect(() => {
    setNotFound(false)
    void (async () => {
      const d = await useServices.getState().services.devices.findBySlug(slug)
      // Solo publica si la revisión no ha cambiado mientras se resolvía (evita
      // que una respuesta lenta del dataset demo pise a la remota ya instalada).
      if (useServices.getState().revision !== revision) return
      setDevice(d)
      setNotFound(d === undefined)
    })()
  }, [slug, revision])

  return { device, notFound }
}

/** Datos relacionales y de trazabilidad del dispositivo. */
export interface DatosFicha {
  readonly relaciones: readonly Relationship[]
  readonly assertions: readonly Assertion[]
  readonly fichas: readonly Datasheet[]
  readonly imagenes: readonly DeviceImage[]
  readonly loading: boolean
}

/** Carga datos relacionales y de trazabilidad del dispositivo. */
export function useDeviceRelations(device: Device | undefined): DatosFicha {
  const [relaciones, setRelaciones] = React.useState<readonly Relationship[]>([])
  const [assertions, setAssertions] = React.useState<readonly Assertion[]>([])
  const [fichas, setFichas] = React.useState<readonly Datasheet[]>([])
  const [imagenes, setImagenes] = React.useState<readonly DeviceImage[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!device) {
      setLoading(false)
      return
    }
    void (async () => {
      const { graph, sourcing } = useServices.getState().services
      setRelaciones(await graph.edgesOf({ type: 'device', slug: device.slug.value }))
      setAssertions(await sourcing.assertionsForDevice(device.slug.value))
      setFichas(await sourcing.datasheetsForDevice(device.slug.value))
      setImagenes(await sourcing.imagesForDevice(device.slug.value))
      setLoading(false)
    })()
  }, [device])

  return { relaciones, assertions, fichas, imagenes, loading }
}

/** Valores EAV del dispositivo (F3, pestaña Capacidades). */
export interface DatosAtributos {
  readonly valores: readonly UiDeviceAttributeValue[]
  readonly loading: boolean
}

export function useDeviceAttributes(device: Device | undefined): DatosAtributos {
  const [valores, setValores] = React.useState<readonly UiDeviceAttributeValue[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!device) {
      setLoading(false)
      return
    }
    void (async () => {
      const { attributes } = useServices.getState().services
      setValores(await attributes.attributeValuesForDevice(device.slug.value))
      setLoading(false)
    })()
  }, [device])

  return { valores, loading }
}

/**
 * Fabricante del dispositivo (para el nº de empresa SNMP de Especificaciones).
 * Se recarga con la revisión del dataset (demo → remoto tras el warmezo F8B).
 */
export function useFabricante(slug: string | undefined): Manufacturer | undefined {
  const [mfr, setMfr] = React.useState<Manufacturer | undefined>()
  const revision = useServices((s) => s.revision)
  React.useEffect(() => {
    if (!slug) {
      setMfr(undefined)
      return
    }
    void (async () => {
      const m = await useServices.getState().services.catalog.manufacturerBySlug(slug)
      if (useServices.getState().revision !== revision) return
      setMfr(m)
    })()
  }, [slug, revision])
  return mfr
}

/** Nombre de la categoría del dispositivo, del catálogo cargado en el store. */
export function useCategoria(device: Device): string {
  const categories = useCatalogStore((s) => s.categories)
  const cat = categories.find((c) => c.code === device.categoryCode)
  return cat?.nameEs ?? device.categoryCode
}

/** Todo lo que consume una pestaña de la ficha, en una sola pasada. */
export interface DatosPestana {
  readonly device: Device
  readonly fabricante: Manufacturer | undefined
  readonly soportes: readonly Relationship[]
  readonly estandares: readonly Relationship[]
  readonly medios: readonly Relationship[]
  readonly compatibles: readonly Relationship[]
  readonly similares: readonly Relationship[]
  readonly fichas: readonly Datasheet[]
  readonly imagenes: readonly DeviceImage[]
  readonly assertions: readonly Assertion[]
  readonly atributos: readonly UiDeviceAttributeValue[]
  readonly atributosLoading: boolean
  readonly loading: boolean
  readonly assertionDe: (pred: string) => Assertion | undefined
}

/** Reúne los datos de la ficha (relaciones, fichas, EAV) para las pestañas. */
export function useDatosPestana(device: Device): DatosPestana {
  const { relaciones, assertions, fichas, imagenes, loading } = useDeviceRelations(device)
  const fabricante = useFabricante(device.manufacturerSlug)
  const { valores: atributos, loading: atributosLoading } = useDeviceAttributes(device)
  const porPredicado = (pred: string): readonly Relationship[] => relaciones.filter((r) => r.predicate === pred)

  return {
    device,
    fabricante,
    fichas,
    imagenes,
    assertions,
    atributos,
    atributosLoading,
    loading,
    soportes: porPredicado('supports-protocol'),
    estandares: porPredicado('implements-standard'),
    medios: porPredicado('terminates-medium'),
    compatibles: porPredicado('compatible-with'),
    similares: porPredicado('similar-to'),
    assertionDe: (pred) => assertions.find((a) => a.predicate === pred),
  }
}
