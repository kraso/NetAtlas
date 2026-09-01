/**
 * Verificación de clave API (F8B, NET-HW-065): la clave llega en claro
 * (`na_…`), se hashea y se compara con el hash almacenado; si coincide, se
 * resuelve el sub (perfil). Nunca se guarda ni se compara texto plano.
 */
import type { SqlitePublicStore } from './public-store.js'
import { hashClaveApi, compararHashes, esFormatoClaveApi } from './api-keys.js'

export interface ClaveVerificada {
  readonly id: string
  readonly prefijo: string
  /** Identidad del consumidor (perfil/sub). */
  readonly sub: string
}

export function creaVerificadorClaveApi(store: SqlitePublicStore) {
  return async (clave: string): Promise<ClaveVerificada | undefined> => {
    if (!esFormatoClaveApi(clave)) return undefined
    const hash = hashClaveApi(clave)
    const fila = await store.claveActivaPorHash(hash)
    if (!fila || !compararHashes(fila.hash, hash)) return undefined
    return { id: fila.id, prefijo: fila.prefijo, sub: fila.id }
  }
}