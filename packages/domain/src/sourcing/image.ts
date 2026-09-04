import type { Source } from './assertion.js'

/**
 * Imagen de un dispositivo (tabla image, F2-Fotos): foto de producto o
 * diagrama con fuente y atribución obligatorias (licencias CC o vendor).
 */
/** Vista del producto (vocabulario cerrado de la tabla image, §9.8). */
export type ImageKind = 'frontal' | 'trasera' | 'lateral' | 'interior' | 'panel'

export interface ImageProps {
  readonly deviceSlug: string
  readonly kind: ImageKind
  readonly caption?: string | undefined
  readonly localPath?: string | undefined
  readonly url?: string | undefined
  readonly source: Source
}

export class DeviceImage {
  readonly deviceSlug: string
  readonly kind: ImageKind
  readonly caption?: string
  readonly localPath?: string
  readonly url?: string
  readonly source: Source

  private constructor(props: ImageProps) {
    if (props.deviceSlug.trim().length === 0) {
      throw new Error('DeviceImage: deviceSlug no puede estar vacío.')
    }
    if (props.kind !== 'frontal' && props.kind !== 'trasera' && props.kind !== 'lateral' && props.kind !== 'interior' && props.kind !== 'panel') {
      throw new Error(`DeviceImage: kind debe ser frontal|trasera|lateral|interior|panel: "${props.kind}".`)
    }
    if (props.url !== undefined && !/^https?:\/\//.test(props.url)) {
      throw new Error(`DeviceImage: url debe ser http(s): "${props.url}".`)
    }
    if (props.url === undefined && props.localPath === undefined) {
      throw new Error('DeviceImage: se requiere url o localPath.')
    }
    this.deviceSlug = props.deviceSlug
    this.kind = props.kind
    this.caption = props.caption
    this.localPath = props.localPath
    this.url = props.url
    this.source = props.source
    Object.freeze(this)
  }

  static create(props: ImageProps): DeviceImage {
    return new DeviceImage(props)
  }

  static hydrate(props: ImageProps): DeviceImage {
    return new DeviceImage(props)
  }
}
