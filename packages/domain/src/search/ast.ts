/**
 * AST del mini-lenguaje de consulta (sección 12.2 del plan maestro).
 * El parser lo produce (NET-HW-012, F1) y el compilador lo traduce a SQL
 * parametrizado. El dominio expone el AST tipado para que UI, compilador
 * y tests compartan el mismo contrato.
 *
 * Gramática (resumen):
 *   consulta ::= termino (ESP termino)*
 *   termino  ::= texto_libre | campo
 *   campo    ::= clave ":" valor | clave ":" valor ".." valor | "-" campo
 */

export type ClaveDsl =
  | 'cat'
  | 'fabricante'
  | 'puertos'
  | 'velocidad'
  | 'poe'
  | 'protocolo'
  | 'estandar'
  | 'capa'
  | 'medio'
  | 'interfaz'
  | 'estado'
  | 'anio'
  | 'formato'

export const CLAVES_DSL: readonly ClaveDsl[] = [
  'cat',
  'fabricante',
  'puertos',
  'velocidad',
  'poe',
  'protocolo',
  'estandar',
  'capa',
  'medio',
  'interfaz',
  'estado',
  'anio',
  'formato',
]

export interface TextoLibre {
  readonly kind: 'texto'
  readonly value: string
}

export interface Igualdad {
  readonly kind: 'igual'
  readonly clave: ClaveDsl
  readonly valor: string
}

export interface Rango {
  readonly kind: 'rango'
  readonly clave: ClaveDsl
  readonly desde: number
  readonly hasta: number
}

export interface Negacion {
  readonly kind: 'negacion'
  readonly operando: DslTermino
}

export interface Requerido {
  readonly kind: 'requerido'
  readonly operando: DslTermino
}

export type DslTermino = TextoLibre | Igualdad | Rango | Negacion | Requerido

export interface ConsultaDsl {
  readonly terminos: readonly DslTermino[]
}

export function consultaVacia(): ConsultaDsl {
  return { terminos: [] }
}

export function consultaCon(terminos: readonly DslTermino[]): ConsultaDsl {
  return { terminos: Object.freeze([...terminos]) }
}

export function esClaveDsl(value: string): value is ClaveDsl {
  return (CLAVES_DSL as readonly string[]).includes(value)
}