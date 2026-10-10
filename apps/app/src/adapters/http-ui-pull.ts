import type { SnapshotBody } from './http-ui-tipos.js'

/** Cabecera de auth opcional (`VITE_API_TOKEN`) para el API server. */
function cabecerasApi(): Record<string, string> {
  const token = import.meta.env.VITE_API_TOKEN
  const headers: Record<string, string> = {}
  if (token) headers['authorization'] = `Bearer ${token}`
  return headers
}

/** Pull del snapshot completo (F8B): falla fuerte si el API no responde 2xx. */
export async function pullSnapshot(apiBase: string, fetchImpl: typeof fetch): Promise<SnapshotBody> {
  const res = await fetchImpl(`${apiBase}/api/snapshot?since=0`, { headers: cabecerasApi() })
  if (!res.ok) {
    throw new Error(`API F8B /api/snapshot devolvió HTTP ${res.status}`)
  }
  return leerSnapshot(res)
}

/** Lee el snapshot del API: JSON ilegible o sin `dispositivos` rompe fuerte. */
async function leerSnapshot(res: Response): Promise<SnapshotBody> {
  let cuerpo: unknown
  try {
    cuerpo = await res.json()
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    throw new Error(`API F8B /api/snapshot devolvió JSON ilegible: ${detalle}`)
  }
  const body = cuerpo as SnapshotBody
  if (!Array.isArray(body?.dispositivos)) {
    throw new Error('API F8B /api/snapshot sin lista de dispositivos')
  }
  return body
}

/** Pull de categorías del API; si el endpoint cae, se derivan del snapshot. */
export async function pullCategorias(apiBase: string, fetchImpl: typeof fetch): Promise<readonly { code: string; nameEs: string; parentCode?: string }[]> {
  try {
    const cr = await fetchImpl(`${apiBase}/api/categories`, { headers: cabecerasApi() })
    if (!cr.ok) {
      // Best-effort explícito: respuesta no 2xx → se derivan del snapshot.
      console.warn(`[WARN] /api/categories respondió HTTP ${cr.status}; se derivan del snapshot`)
      return []
    }
    const cb = (await cr.json()) as { categorias: readonly { code: string; nameEs: string; parentCode?: string }[] }
    return cb.categorias ?? []
  } catch (error) {
    // Best-effort explícito: /api/categories caído → se derivan del snapshot.
    console.warn('[WARN] /api/categories no disponible; se derivan del snapshot', { error })
  }
  return []
}
