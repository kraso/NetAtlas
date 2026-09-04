import type { Source } from './assertion.js'

/**
 * Datasheet/documento de un dispositivo (tabla datasheet, F2-Documentación).
 * Ficha documental con fuente trazable: título, idioma, URL o copia local.
 */
export interface DatasheetProps {
  readonly deviceSlug: string
  readonly title: string
  readonly language: string
  readonly url?: string | undefined
  readonly localPath?: string | undefined
  readonly source: Source
}

export class Datasheet {
  readonly deviceSlug: string
  readonly title: string
  readonly language: string
  readonly url?: string
  readonly localPath?: string
  readonly source: Source

  private constructor(props: DatasheetProps) {
    if (props.deviceSlug.trim().length === 0) {
      throw new Error('Datasheet: deviceSlug no puede estar vacío.')
    }
    if (props.title.trim().length === 0) {
      throw new Error('Datasheet: title no puede estar vacío.')
    }
    if (!/^[a-z]{2}$/.test(props.language)) {
      throw new Error(`Datasheet: language debe ser ISO-639-1 (2 letras): "${props.language}".`)
    }
    if (props.url !== undefined && !/^https?:\/\//.test(props.url)) {
      throw new Error(`Datasheet: url debe ser http(s): "${props.url}".`)
    }
    this.deviceSlug = props.deviceSlug
    this.title = props.title
    this.language = props.language
    this.url = props.url
    this.localPath = props.localPath
    this.source = props.source
    Object.freeze(this)
  }

  static create(props: DatasheetProps): Datasheet {
    return new Datasheet(props)
  }

  static hydrate(props: DatasheetProps): Datasheet {
    return new Datasheet(props)
  }
}
