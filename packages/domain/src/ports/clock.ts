/**
 * Utilidades de dominio que la infraestructura implementa (sección 6.6).
 */

export interface Clock {
  now(): Date
}

export interface IdGen {
  next(): number
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}