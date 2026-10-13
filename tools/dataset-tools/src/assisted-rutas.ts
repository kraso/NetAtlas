import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Rutas del generador asistido (NET-HW-007): el seed curado vive en
 * `datasets/seed` y la salida asistida se escribe aparte de las fichas
 * manuales para poder regenerarla sin tocar lo curado.
 */

const aqui = dirname(fileURLToPath(import.meta.url))

export const SEED_DIR = resolve(aqui, '..', '..', '..', 'datasets', 'seed')
export const OUT_FILE = join(SEED_DIR, 'devices-generated.json')
export const DEVICES_MANUALES = join(SEED_DIR, 'devices.json')
