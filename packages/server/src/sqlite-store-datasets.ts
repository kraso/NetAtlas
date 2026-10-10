import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { DatasetPublico } from './store.js'

/**
 * Conjuntos de datos descargables firmados (§31.3 / F8B): lee el SQLite y su
 * manifiesto del disco y expone blob + sha256 por red pública.
 */
export async function conjuntosDeDatos(dbPath: string | undefined): Promise<readonly DatasetPublico[]> {
  if (!dbPath || !existsSync(dbPath)) return []
  const buffer = readFileSync(dbPath)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const manifiestoPath = `${dbPath}.manifest.json`
  let manifiesto: Record<string, unknown> = { sha256 }
  if (existsSync(manifiestoPath)) {
    try {
      manifiesto = JSON.parse(readFileSync(manifiestoPath, 'utf8')) as Record<string, unknown>
    } catch (error) {
      // Best-effort explícito: sin manifiesto legible se sirve el hash calculado.
      console.warn(`[WARN] manifiesto de dataset ilegible en ${manifiestoPath}`, { error })
    }
  }
  return [
    {
      nombre: 'netatlas-seed',
      manifiesto,
      blob: new Blob([buffer], { type: 'application/x-sqlite3' }),
      sha256,
    },
  ]
}
