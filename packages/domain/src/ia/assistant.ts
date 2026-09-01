/**
 * Contrato del asistente de IA (sección 21 del plan maestro, F7).
 *
 * El asistente NUNCA inventa datos: responde solo a partir de la base validada
 * (dispositivos, assertions con fuente, aristas curadas). Cada afirmación
 * enlaza a su entidad/fuente (cita obligatoria, §21.1[4]). El puerto es un
 * puerto más del dominio (§21.4): el adaptador puede ser local (determinista),
 * cloud opcional o un mock en tests. La app es 100% funcional sin IA
 * (feature flag `ai.enabled` off por defecto).
 */

/** Una cita: cada afirmación de la respuesta enlaza a su entidad y fuente. */
export interface CitaIA {
  /** Tipo y slug de la entidad citada (device:/protocolo:/estandar:/medio:…). */
  readonly tipo: string
  readonly slug: string
  /** Etiqueta legible (nombre del dispositivo, código del protocolo…). */
  readonly etiqueta: string
  /** Slug de la fuente documental (assertion) cuando la afirmación la tiene. */
  readonly fuenteSlug?: string | undefined
  /** Afirmación literal citada (predicado + valor legible), si aplica. */
  readonly afirmacion?: string | undefined
}

/** Herramienta expuesta al asistente (function calling, §21.1[5]). */
export interface HerramientaIA {
  readonly nombre: string
  readonly descripcion: string
  /** Esquema JSON de los argumentos (para function calling). */
  readonly esquemaEntrada: Readonly<Record<string, unknown>>
}

/** Llamada a una herramienta registrada por el plan de respuesta. */
export interface LlamadaHerramienta {
  readonly herramienta: string
  readonly argumentos: Readonly<Record<string, unknown>>
}

/** Resultado opaco de la ejecución de una herramienta (solo datos planos). */
export interface ResultadoHerramienta {
  readonly herramienta: string
  /** Datos planos (JSON-safe) devueltos por la herramienta. */
  readonly datos: Readonly<Record<string, unknown>>
  /** Verdadero si la herramienta no pudo responder (sin datos). */
  readonly sinDatos?: boolean | undefined
}

/** Pregunta del usuario. */
export interface PreguntaIA {
  readonly texto: string
}

/**
 * Respuesta del asistente: texto con citas obligatorias.
 * `honesta` = el asistente reconoce explícitamente cuando no tiene datos
 * validados, en lugar de inventar.
 */
export interface RespuestaIA {
  readonly texto: string
  /** Citas de cada afirmación (puede estar vacío en respuestas honestas). */
  readonly citas: readonly CitaIA[]
  /** Herramientas ejecutadas por el plan (transparencia §21.1[5]). */
  readonly herramientas: readonly ResultadoHerramienta[]
  /** Marcado como explicación generada (escenario 3, §21.2). */
  readonly esExplicacion: boolean
  /** 'no-tengo-datos' = no había contexto validado para esta pregunta. */
  readonly modo: 'respuesta' | 'no-tengo-datos' | 'explicacion'
}

/**
 * Puerto AssistantPort (sección 6.6 / 21.4).
 * El adaptador implementa el ciclo comprensión → recuperación → respuesta
 * con citas; el dominio aporta las herramientas puras y el evaluador.
 */
export interface AssistantPort {
  ask(pregunta: PreguntaIA): Promise<RespuestaIA>
}