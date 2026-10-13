import { readFileSync } from 'node:fs'
import type { SeedCatalogs, SeedDevice } from './lint-tipos.js'

/** Lectura del dataset seed desde disco (`data:lint` y herramientas del dataset). */

/** Lee y parsea un JSON del seed: un fichero ilegible rompe fuerte y temprano. */
function leerJson<T>(dir: string, file: string): T {
  try {
    return JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as T
  } catch (err) {
    throw new Error(`No se pudo leer ${file}: ${(err as Error).message}`)
  }
}

/** Fichas curadas (devices.json) + asistidas (devices-generated.json), si existe. */
function cargarDispositivos(dir: string): readonly SeedDevice[] {
  const manuales = leerJson<SeedDevice[]>(dir, 'devices.json')
  try {
    return [...manuales, ...leerJson<SeedDevice[]>(dir, 'devices-generated.json')]
  } catch {
    return manuales
  }
}

/** Carga los siete ficheros del seed. */
export function loadSeed(dir: string): SeedCatalogs {
  return {
    categories: leerJson(dir, 'categories.json'),
    manufacturers: leerJson(dir, 'manufacturers.json'),
    sources: leerJson(dir, 'sources.json'),
    protocols: leerJson(dir, 'protocols.json'),
    standards: leerJson(dir, 'standards.json'),
    media: leerJson(dir, 'media.json'),
    devices: cargarDispositivos(dir),
  }
}
