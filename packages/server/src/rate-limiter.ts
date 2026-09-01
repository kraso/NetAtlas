/**
 * Rate limiting por clave API (F8B, NET-HW-065, §31.3 / §22.2 Fase 8).
 *
 * Ventana deslizante en memoria (sin dependencias): cada clave tiene un
 * contador con su timestamp de ventana; al superar el límite devuelve 429 con
 * `Retry-After`. Suficiente para la v1 local-first; en despliegue multi-nodo
 * se sustituye por un almacén compartido (redis/pg) con el mismo contrato.
 */

export interface RateLimiter {
  /** Devuelve true si la petición está dentro del límite. */
  allow(clave: string): boolean
  /** Segundos que faltan para reabrir la ventana (para Retry-After). */
  retryAfter(clave: string): number
  limite(): number
}

export function crearRateLimiter(limitePorMinuto: number, ventanaMs = 60_000): RateLimiter {
  const estados = new Map<string, { ventana: number; count: number }>()

  return {
    allow(clave: string): boolean {
      const ahora = Date.now()
      const previo = estados.get(clave)
      if (!previo || ahora - previo.ventana >= ventanaMs) {
        estados.set(clave, { ventana: ahora, count: 1 })
        return true
      }
      if (previo.count >= limitePorMinuto) return false
      previo.count++
      estados.set(clave, previo)
      return true
    },

    retryAfter(clave: string): number {
      const previo = estados.get(clave)
      if (!previo) return 0
      const restante = previo.ventana + ventanaMs - Date.now()
      return Math.max(0, Math.ceil(restante / 1000))
    },

    limite() {
      return limitePorMinuto
    },
  }
}