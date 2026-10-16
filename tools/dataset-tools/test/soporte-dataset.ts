import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Soporte compartido de las suites del build: rutas del repositorio y archivos
 * temporales. El build escribe un SQLite de verdad, así que cada suite pide
 * aquí su carpeta aislada en vez de repetir el cableado de rutas.
 */

/** Fuentes del seed (`datasets/seed`), derivadas de la ruta de este archivo. */
export const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'datasets', 'seed')

/** Carpeta temporal aislada por suite; se borra con `limpiar`. */
export function carpetaTemporal(prefijo: string): string {
  return mkdtempSync(join(tmpdir(), prefijo))
}

/** Ruta de un archivo dentro de una carpeta temporal. */
export function rutaEn(carpeta: string, nombre: string): string {
  return join(carpeta, nombre)
}

/** Escribe texto UTF-8 (datasets de mentira y manifiestos). */
export function escribirTexto(ruta: string, texto: string): void {
  writeFileSync(ruta, texto, 'utf8')
}

/** Lee texto UTF-8. */
export function leerTexto(ruta: string): string {
  return readFileSync(ruta, 'utf8')
}

/** Borra una carpeta temporal con todo su contenido. */
export function limpiar(carpeta: string): void {
  rmSync(carpeta, { recursive: true, force: true })
}
