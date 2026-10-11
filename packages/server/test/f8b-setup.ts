/**
 * Servidor compartido de los tests F8B (§31.3). Vitest aísla módulos por
 * archivo, así que un singleton en memoria no sirve: el servidor se levanta
 * una sola vez en `globalSetup` y los tres archivos lo consumen por HTTP, con
 * una única copia del seed en lugar de una por archivo.
 *
 * Aislamiento entre archivos:
 *  - el rate limit y los favoritos son por clave, así que cada archivo recibe
 *    la suya y no compite con las demás;
 *  - cada archivo muta entidades propias (contribuciones) y ninguno afirma
 *    sobre totales globales del catálogo;
 *  - la BD sí es común: es el precio de compartir servidor y es visible en el
 *    estado que los tests escriben, nunca en lo que leen del seed.
 */
import { generarClaveApi } from '../src/api-keys.js'
import { crearPerfil } from '@netatlas/domain'
import { levantarServidorPrueba } from './servidor-prueba.js'
import type { GlobalSetupContext } from 'vitest/node'
import type { ServidorPrueba } from './servidor-prueba.js'

export interface ClavesF8B {
  readonly tercero: string
  readonly datasets: string
  readonly lector: string
  readonly curator: string
  readonly reviewer: string
}

export interface F8BCompartido {
  readonly url: string
  readonly claves: ClavesF8B
}

declare module 'vitest' {
  interface ProvidedContext {
    /** URL y claves del servidor compartido que levanta `configurarF8B`. */
    f8b: F8BCompartido
  }
}

/** Claves de API de cada archivo, con su id estable para no pisarse. */
function clavesPorArchivo(): ReadonlyArray<readonly [string, keyof ClavesF8B]> {
  return [
    ['key-tercero-1', 'tercero'],
    ['key-ds-1', 'datasets'],
    ['key-leg-1', 'lector'],
    ['key-cur-1', 'curator'],
    ['key-rev-1', 'reviewer'],
  ]
}

/** Registra todas las claves de la suite y devuelve sus valores. */
async function registrarClaves(servidor: ServidorPrueba): Promise<ClavesF8B> {
  const claves = {} as Record<keyof ClavesF8B, string>
  for (const [id, nombre] of clavesPorArchivo()) {
    const clave = generarClaveApi()
    claves[nombre] = clave
    await servidor.publicStore.registrarClave(id, clave)
  }
  return claves
}

/** Promoción inicial: el "admin" establece curator y reviewer con el store. */
async function promoverRoles(servidor: ServidorPrueba): Promise<void> {
  await servidor.publicStore.guardar(crearPerfil({ id: 'key-cur-1', nick: 'curador', rol: 'curator' }))
  await servidor.publicStore.guardar(crearPerfil({ id: 'key-rev-1', nick: 'revisor', rol: 'reviewer' }))
}

/** Levanta el servidor F8B y publica URL y claves para los tests. */
export default async function configurarF8B({ provide }: GlobalSetupContext): Promise<() => void> {
  const servidor = await levantarServidorPrueba({
    prefijo: 'server-f8b',
    token: 'token-sync',
    version: '0.2.0-f8b',
    apiPublica: true,
    limitePorMinuto: 10,
    conRutaDbEnStore: true,
  })
  const claves = await registrarClaves(servidor)
  await promoverRoles(servidor)
  provide('f8b', { url: servidor.url, claves } satisfies F8BCompartido)
  return () => servidor.cerrar()
}
