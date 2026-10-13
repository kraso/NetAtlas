import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDemoDataset } from '../src/adapters/in-memory.js'

const here = dirname(fileURLToPath(import.meta.url))
// Bundle que publica la app (Vite copia apps/app/public → dist).
const publicDir = join(here, '..', '..', '..', 'apps', 'app', 'public')

/**
 * El invariante 12 de data:lint valida el seed; el fixture demo del adaptador
 * in-memory no pasa por él, así que sus enlaces podrían apuntar a un fichero
 * que la app no sirve.
 */
describe('Datasheets del fixture demo', () => {
  it('todo localPath del demo existe dentro del bundle', () => {
    const fichas = buildDemoDataset().datasheets ?? []
    expect(fichas.length).toBeGreaterThan(0)
    for (const ficha of fichas) {
      if (ficha.localPath === undefined) continue
      expect(existsSync(join(publicDir, ficha.localPath)), ficha.localPath).toBe(true)
    }
  })
})
