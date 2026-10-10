import { Datasheet, DeviceImage } from '@netatlas/domain'
import type { Device, Source, SyncDeviceDetail } from '@netatlas/domain'
import type { InMemoryAttributeDefinition, InMemoryDeviceAttributeValue } from './in-memory.js'
import type { SnapshotBody } from './http-ui-tipos.js'
import { COMPARE_RULES, IMAGE_KINDS, VALUE_TYPES } from './http-ui-tipos.js'

/**
 * Recursos del detalle (F8B): EAV (definiciones globales + valores con display
 * ya calculado en servidor), datasheets e imágenes — una fila inválida se
 * descarta sin tumbar el pull.
 */

export function construirEav(
  body: SnapshotBody,
  known: ReadonlySet<string>,
): { attributeDefinitions: InMemoryAttributeDefinition[]; deviceAttributeValues: InMemoryDeviceAttributeValue[] } {
  const attributeDefinitions: InMemoryAttributeDefinition[] = []
  for (const d of body.detalle?.attributeDefinitions ?? []) {
    if (!VALUE_TYPES.has(d.valueType) || !COMPARE_RULES.has(d.compareRule)) continue
    attributeDefinitions.push({
      key: d.key,
      labelEs: d.labelEs,
      valueType: d.valueType as InMemoryAttributeDefinition['valueType'],
      unit: d.unit ?? undefined,
      enumValues: d.enumValues ? [...d.enumValues] : undefined,
      isFacet: d.isFacet,
      isComparable: d.isComparable,
      compareRule: d.compareRule as InMemoryAttributeDefinition['compareRule'],
      categoryCode: d.categoryCode,
    })
  }
  const deviceAttributeValues: InMemoryDeviceAttributeValue[] = (body.detalle?.devices ?? []).flatMap((d) =>
    known.has(d.slug) ? d.attributeValues.map((v) => ({ deviceSlug: d.slug, key: v.key, display: v.display })) : [],
  )
  return { attributeDefinitions, deviceAttributeValues }
}

/** Imágenes de producto (F2-Documentación): una fila inválida no tumba el pull. */
export function construirImagenes(
  dispositivos: readonly Device[],
  detPorSlug: ReadonlyMap<string, SyncDeviceDetail>,
  fuentes: ReadonlyMap<string, Source>,
): DeviceImage[] {
  const imagenes: DeviceImage[] = []
  dispositivos.forEach((dev) => {
    const det = detPorSlug.get(dev.slug.value)
    if (!det) return
    for (const g of det.images ?? []) {
      const imagen = imagenDe(dev, g, fuentes)
      if (imagen) imagenes.push(imagen)
    }
  })
  return imagenes
}

/** Guarda de tipo: el dominio solo acepta los kinds conocidos de imagen. */
function esImageKind(kind: string): kind is DeviceImage['kind'] {
  return IMAGE_KINDS.has(kind)
}

/** Una imagen del detalle → DeviceImage (fila inválida → undefined). */
function imagenDe(dev: Device, g: SyncDeviceDetail['images'][number], fuentes: ReadonlyMap<string, Source>): DeviceImage | undefined {
  try {
    const fuente = fuentes.get(g.sourceSlug)
    if (!fuente || !esImageKind(g.kind)) return undefined
    return DeviceImage.create({
      deviceSlug: dev.slug.value,
      kind: g.kind,
      caption: g.caption ?? undefined,
      localPath: g.localPath ?? undefined,
      url: g.url ?? undefined,
      source: fuente,
    })
  } catch (error) {
    // Best-effort explícito: imagen inválida → descartar fila del pull.
    console.warn(`[WARN] imagen inválida en el pull F8B: ${dev.slug.value} (${g.kind})`, { error })
    return undefined
  }
}

/** Datasheets (F2-Documentación): una fila inválida no tumba el pull. */
export function construirFichas(
  dispositivos: readonly Device[],
  detPorSlug: ReadonlyMap<string, SyncDeviceDetail>,
  fuentes: ReadonlyMap<string, Source>,
): Datasheet[] {
  const fichas: Datasheet[] = []
  dispositivos.forEach((dev) => {
    const det = detPorSlug.get(dev.slug.value)
    if (!det) return
    for (const f of det.datasheets ?? []) {
      const ficha = fichaDe(dev, f, fuentes)
      if (ficha) fichas.push(ficha)
    }
  })
  return fichas
}

/** Una ficha del detalle → Datasheet (fila inválida → undefined). */
function fichaDe(dev: Device, f: SyncDeviceDetail['datasheets'][number], fuentes: ReadonlyMap<string, Source>): Datasheet | undefined {
  try {
    const fuente = fuentes.get(f.sourceSlug)
    if (!fuente) return undefined
    return Datasheet.create({
      deviceSlug: dev.slug.value,
      title: f.title,
      language: f.language,
      url: f.url ?? undefined,
      localPath: f.localPath ?? undefined,
      source: fuente,
    })
  } catch (error) {
    // Best-effort explícito: ficha inválida (idioma no ISO, URL no http…) → descartar fila.
    console.warn(`[WARN] ficha inválida en el pull F8B: ${dev.slug.value}`, { error })
    return undefined
  }
}
