/**
 * Rate limiting por clave API (F8B, NET-HW-065, §31.3 / §22.2 Fase 8).
 *
 * Dos implementaciones, mismo espíritu:
 *  - `crearRateLimiter` — ventana deslizante EN MEMORIA (default, un nodo,
 *    sin dependencias; interfaz síncrona).
 *  - `crearRateLimiterPersistente` + `RateLimitStore` — respaldo en BD
 *    (tabla `netatlas_rate_limit`): el contador se comparte entre MÚLTIPLES
 *    instancias que apuntan al mismo almacén → rate limit multi-nodo (§31.3).
 */

import type { SqlExecutor } from './store.js'

export interface RateLimiter {
  /** Devuelve true si la petición está dentro del límite. */
  allow(clave: string): boolean
  /** Segundos que faltan para reabrir la ventana (para Retry-After). */
  retryAfter(clave: string): number
  limite(): number
}

/** Variante asíncrona (respaldo en BD). */
export interface RateLimiterAsync {
  allow(clave: string): Promise<boolean>
  retryAfter(clave: string): Promise<number>
  limite(): number
}

/** Almacén compartido para el respaldo multi-nodo (fila por clave). */
export interface RateLimitStore {
  leer(clave: string): Promise<{ count: number; ventana: number } | undefined>
  /** Suma 1 idempotente; devuelve (recuento, ventana) después del incremento. */
  incrementar(clave: string, ahora: number, ventanaMs: number): Promise<{ count: number; ventana: number }>
}

/** Ventana deslizante en memoria (un solo nodo). */
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
      estados.set(clave, { ventana: previo.ventana, count: previo.count + 1 })
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

/** SQL de la tabla compartida (runtime-only, idempotente). */
export const SQL_RATE_LIMIT = `
  CREATE TABLE IF NOT EXISTS netatlas_rate_limit (
    clave TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    ventana INTEGER NOT NULL
  );
`

/** Respaldo sobre un SQL executor (la BD del servidor; multi-nodo si comparten ruta). */
export class SqlRateLimitStore implements RateLimitStore {
  constructor(private readonly db: SqlExecutor) {
    db.exec(SQL_RATE_LIMIT)
  }

  async leer(clave: string): Promise<{ count: number; ventana: number } | undefined> {
    const filas = await this.db.query<{ count: number; ventana: number }>(
      'SELECT count, ventana FROM netatlas_rate_limit WHERE clave = ?',
      [clave],
    )
    const f = filas[0]
    return f ? { count: Number(f.count), ventana: Number(f.ventana) } : undefined
  }

  async incrementar(clave: string, ahora: number, ventanaMs: number): Promise<{ count: number; ventana: number }> {
    const previo = await this.leer(clave)
    if (!previo || ahora - previo.ventana >= ventanaMs) {
      await this.db.exec(
        `INSERT INTO netatlas_rate_limit (clave, count, ventana) VALUES (?, 1, ?)
         ON CONFLICT(clave) DO UPDATE SET count = 1, ventana = excluded.ventana`,
        [clave, ahora],
      )
      return { count: 1, ventana: ahora }
    }
    const nuevo = { count: previo.count + 1, ventana: previo.ventana }
    await this.db.exec('UPDATE netatlas_rate_limit SET count = ? WHERE clave = ?', [nuevo.count, clave])
    return nuevo
  }
}

/** Rate limiter con estado compartido en BD: mismo límite entre nodos. */
export function crearRateLimiterPersistente(
  limitePorMinuto: number,
  store: RateLimitStore,
  ventanaMs = 60_000,
): RateLimiterAsync {
  return {
    async allow(clave: string): Promise<boolean> {
      const ahora = Date.now()
      const estado = await store.incrementar(clave, ahora, ventanaMs)
      return estado.count <= limitePorMinuto
    },

    async retryAfter(clave: string): Promise<number> {
      const previo = await store.leer(clave)
      if (!previo) return 0
      const restante = previo.ventana + ventanaMs - Date.now()
      return Math.max(0, Math.ceil(restante / 1000))
    },

    limite() {
      return limitePorMinuto
    },
  }
}