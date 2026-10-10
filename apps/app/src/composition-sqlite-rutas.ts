import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Ruta del dataset firmable que abre la composición SQLite de la UI
 * (`datasets/netatlas-seed.sqlite`, 330 dispositivos).
 */

const aqui = dirname(fileURLToPath(import.meta.url))

export const DB_PATH = join(aqui, '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')
