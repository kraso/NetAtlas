/**
 * Rutas compartidas por los tests del servidor: la raíz del repositorio y el
 * seed que se copia a un fichero temporal (los tests mutan la BD; el seed en
 * disco no debe ensuciarse).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

export const raizRepo = join(aqui, '..', '..', '..')
export const migracionesDir = join(raizRepo, 'packages', 'data', 'migrations')
export const seedPath = join(raizRepo, 'datasets', 'netatlas-seed.sqlite')

/** Ruta de una copia temporal del seed, única por proceso y ejecución. */
export function rutaSeedTemporal(prefijo: string): string {
  const azar = Math.random().toString(36).slice(2)
  return join(raizRepo, 'datasets', `.${prefijo}-${process.pid}-${azar}.sqlite`)
}
