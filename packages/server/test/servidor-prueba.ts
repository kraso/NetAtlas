/**
 * Servidor HTTP de pruebas: monta el middleware real (`crearServidor` y, si se
 * pide, la API pública `/v1` con su rate limit) en un puerto efímero de
 * loopback sobre una base SQLite temporal. Devuelve la URL base y un `cerrar()`
 * que apaga el servidor, cierra la BD y borra la copia del seed.
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { crearApiPublica, crearServidor, StaticBearerVerifier } from '../src/index.js'
import { crearSqlitePrueba, type SqlitePrueba } from './sqlite-prueba.js'

export interface OpcionesServidorPrueba {
  /** Prefijo del seed temporal (por defecto `server-test`). */
  readonly prefijo?: string
  readonly token?: string
  readonly version?: string
  /** Monta además la API pública `/v1`. */
  readonly apiPublica?: boolean
  /** Peticiones por minuto de la API pública (por defecto 120). */
  readonly limitePorMinuto?: number
  /** Expone la ruta del SQLite al store (dataset firmado, §31.3). */
  readonly conRutaDbEnStore?: boolean
}

export interface ServidorPrueba extends SqlitePrueba {
  /** URL base, p. ej. `http://127.0.0.1:53124`. */
  readonly url: string
  /** Cierra el servidor, la BD y borra la copia temporal del seed. */
  cerrar(): void
}

/**
 * Escucha en un puerto libre de loopback y resuelve la URL base. Un fallo de
 * bind (puerto agotado, loopback no disponible) rechaza con el motivo.
 */
function escuchar(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const alFallar = (error: Error): void => reject(new Error(`No se pudo escuchar en 127.0.0.1: ${error.message}`))
    server.once('error', alFallar)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', alFallar)
      const puerto = (server.address() as AddressInfo).port
      resolve(`http://127.0.0.1:${puerto}`)
    })
  })
}

/** Levanta el servidor de pruebas con una base SQLite recién creada. */
export async function levantarServidorPrueba(opciones: OpcionesServidorPrueba = {}): Promise<ServidorPrueba> {
  const sqlite = crearSqlitePrueba(opciones.prefijo ?? 'server-test', { conRutaDbEnStore: opciones.conRutaDbEnStore })
  const token = opciones.token ?? 'token-prueba'
  const base = crearServidor(sqlite.store, new StaticBearerVerifier(token), opciones.version ?? '0.1.0-test')
  const handler = opciones.apiPublica
    ? crearApiPublica({
        store: sqlite.store,
        publicStore: sqlite.publicStore,
        base,
        limitePorMinuto: opciones.limitePorMinuto ?? 120,
      })
    : base
  const server = createServer((req, res) => void handler(req, res))
  const url = await escuchar(server)
  return {
    ...sqlite,
    url,
    cerrar: () => {
      server.close()
      sqlite.cerrar()
    },
  }
}
