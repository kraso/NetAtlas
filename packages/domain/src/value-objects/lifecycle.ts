/** Estado de ciclo de vida de un dispositivo (sección 8.2.1 del plan maestro). */
export const LIFECYCLE_STATUSES = [
  'announced',
  'current',
  'mature',
  'eol',
  'eos',
  'legacy',
  'discontinued',
] as const

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

export function isLifecycleStatus(value: string): value is LifecycleStatus {
  return (LIFECYCLE_STATUSES as readonly string[]).includes(value)
}

/** Valida que un estado sea uno de los canónicos; lanza si no. */
export function requireLifecycleStatus(value: string): LifecycleStatus {
  if (!isLifecycleStatus(value)) {
    throw new Error(
      `Estado de ciclo de vida inválido: "${value}". Válidos: ${LIFECYCLE_STATUSES.join(', ')}.`,
    )
  }
  return value
}