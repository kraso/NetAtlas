import type { SqliteDriver } from '../driver.js'
import { SqliteDeviceRepository } from '../repositories/device-repository.js'
import { SqliteAttributesRepository } from '../repositories/attributes-repository.js'

/**
 * `compareDevices` del asistente: tabla unificada de atributos EAV por slug
 * (clave/label/valor por dispositivo) sin pasar por el motor de comparación.
 */
export async function compararDispositivos(db: SqliteDriver, ids: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
  const repoAttrs = new SqliteAttributesRepository(db)
  const repoDevices = new SqliteDeviceRepository(db)
  const filas: { clave: string; labelEs: string; valores: Record<string, string> }[] = []
  const dispositivos: { slug: string; nombre: string }[] = []

  const porSlug = new Map<string, { clave: string; display: string; labelEs: string }[]>()
  for (const id of ids) {
    const device = await repoDevices.findBySlug(id)
    if (!device) continue
    dispositivos.push({ slug: id, nombre: device.name })
    const attrs = await repoAttrs.attributeValuesForDevice(id)
    porSlug.set(id, attrs.map((a) => ({ clave: a.key, display: a.display, labelEs: a.labelEs })))
  }

  const claves = new Set<string>()
  for (const v of porSlug.values()) for (const a of v) claves.add(a.clave)
  const labels = new Map<string, string>()
  for (const attrs of porSlug.values()) for (const a of attrs) labels.set(a.clave, a.labelEs)
  for (const clave of claves) {
    const valores: Record<string, string> = {}
    for (const id of ids) {
      const v = porSlug.get(id)?.find((x) => x.clave === clave)
      valores[id] = v?.display ?? '—'
    }
    filas.push({ clave, labelEs: labels.get(clave) ?? clave, valores })
  }
  return { dispositivos, diferencias: filas }
}
