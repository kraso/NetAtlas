/** Nivel de confianza de una afirmación (sección 20.3 del plan maestro). */
export const CONFIDENCE_LEVELS = [
  'official',
  'derived',
  'third-party',
  'experimental',
  'historical',
] as const

export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

export function isConfidence(value: string): value is Confidence {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(value)
}

/**
 * Fuente documental (tabla source, sección 20.2).
 * Toda afirmación crítica cuelga de una fuente con nivel de autoridad.
 */
export interface SourceProps {
  readonly slug: string
  readonly kind:
    | 'datasheet'
    | 'manual'
    | 'rfc'
    | 'ieee'
    | 'web-oficial'
    | 'libro'
    | 'terceros'
    | 'editorial'
  readonly publisher?: string | undefined
  readonly title: string
  readonly url?: string | undefined
  readonly publishedOn?: string | undefined
  readonly retrievedOn?: string | undefined
  /** 1 oficial … 4 comunitario */
  readonly authorityLevel: 1 | 2 | 3 | 4
}

export class Source {
  readonly slug: string
  readonly kind: SourceProps['kind']
  readonly publisher?: string
  readonly title: string
  readonly url?: string
  readonly publishedOn?: string
  readonly retrievedOn?: string
  readonly authorityLevel: 1 | 2 | 3 | 4

  private constructor(props: SourceProps) {
    if (props.title.trim().length === 0) {
      throw new Error('Source: title no puede estar vacío.')
    }
    if (props.retrievedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(props.retrievedOn)) {
      throw new Error(`Source: retrieved_on debe ser ISO-8601 (YYYY-MM-DD): "${props.retrievedOn}".`)
    }
    this.slug = props.slug
    this.kind = props.kind
    this.publisher = props.publisher
    this.title = props.title
    this.url = props.url
    this.publishedOn = props.publishedOn
    this.retrievedOn = props.retrievedOn
    this.authorityLevel = props.authorityLevel
    Object.freeze(this)
  }

  static create(props: SourceProps): Source {
    return new Source(props)
  }

  static hydrate(props: SourceProps): Source {
    return new Source(props)
  }
}

/**
 * Afirmación: dato atómico con fuente y confianza (sección 20.1).
 * (subject_type, subject_id, predicate, value_json) + fuente + confianza + fechas.
 */
export interface AssertionProps {
  readonly subjectType: string
  readonly subjectId: number
  readonly predicate: string
  readonly valueJson: string
  readonly source: Source
  readonly confidence: Confidence
  readonly verifiedOn: string
  readonly author: string
  readonly reviewedBy?: string | undefined
  readonly note?: string | undefined
}

export class Assertion {
  readonly subjectType: string
  readonly subjectId: number
  readonly predicate: string
  readonly valueJson: string
  readonly source: Source
  readonly confidence: Confidence
  readonly verifiedOn: string
  readonly author: string
  readonly reviewedBy?: string
  readonly note?: string

  private constructor(props: AssertionProps) {
    if (!isConfidence(props.confidence)) {
      throw new Error(`Confianza inválida: "${props.confidence}".`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(props.verifiedOn)) {
      throw new Error(`verified_on debe ser ISO-8601: "${props.verifiedOn}".`)
    }
    this.subjectType = props.subjectType
    this.subjectId = props.subjectId
    this.predicate = props.predicate
    this.valueJson = props.valueJson
    this.source = props.source
    this.confidence = props.confidence
    this.verifiedOn = props.verifiedOn
    this.author = props.author
    this.reviewedBy = props.reviewedBy
    this.note = props.note
    Object.freeze(this)
  }

  static create(props: AssertionProps): Assertion {
    return new Assertion(props)
  }

  /** Dato crítico sin revisor → pendiente de revisión (sección 20.4). */
  get pendingReview(): boolean {
    return this.reviewedBy === undefined
  }
}