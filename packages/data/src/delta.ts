import type { SqliteDriver, SqlRow } from './driver.js'
import { CatalogDao } from './daos/catalog-dao.js'
import type { DeltaChange } from '@netatlas/domain'

/**
 * Actualización delta de datasets (NET-HW-048, §19.4): diff entre dos SQLite
 * (altas/actualizaciones/borrados por slug) y aplicación transaccional sobre
 * el destino — el flujo "lote externo sin SQL a mano" del criterio F6.
 */

export interface DeltaApplyResult {
  readonly aplicados: number
  readonly rechazados: number
  readonly razones: readonly string[]
}

/** Aplica un delta en una transacción única (rollback total ante error duro). */
export function applyDelta(driver: SqliteDriver, cambios: readonly DeltaChange[]): DeltaApplyResult {
  const dao = new CatalogDao(driver)
  let aplicados = 0
  const razones: string[] = []
  driver.transaction(() => {
    for (const c of cambios) {
      try {
        if (c.accion === 'delete') {
          if (dao.eliminarDeviceCompleto(c.slug)) aplicados++
          else razones.push(`${c.slug}: no existe (borrado ignorado)`)
          continue
        }
        const d = c.datos
        if (!d?.name || !d.manufacturerSlug || !d.categoryCode || !d.lifecycleStatus) {
          razones.push(`${c.slug}: datos incompletos (${c.accion})`)
          continue
        }
        dao.upsertDevice({
          slug: c.slug,
          name: d.name,
          manufacturerSlug: d.manufacturerSlug,
          categoryCode: d.categoryCode,
          lifecycleStatus: d.lifecycleStatus,
          summary: d.summary,
        })
        aplicados++
      } catch (err) {
        razones.push(`${c.slug}: ${(err as Error).message}`)
      }
    }
  })
  return { aplicados, rechazados: razones.length, razones }
}

interface DeviceView {
  readonly slug: string
  readonly name: string
  readonly manufacturerSlug: string
  readonly categoryCode: string
  readonly lifecycleStatus: string
  readonly summary?: string
}

function vistaDe(driver: SqliteDriver): Map<string, DeviceView> {
  const rows = driver
    .prepare(
      `SELECT d.slug AS slug, d.name AS name, m.slug AS manufacturer_slug,
              c.code AS category_code, d.lifecycle_status AS lifecycle_status, d.summary AS summary
       FROM device d
       JOIN manufacturer m ON m.id = d.manufacturer_id
       JOIN category c ON c.id = d.category_id`,
    )
    .all() as SqlRow[]
  const mapa = new Map<string, DeviceView>()
  for (const r of rows) {
    mapa.set(String(r.slug), {
      slug: String(r.slug),
      name: String(r.name),
      manufacturerSlug: String(r.manufacturer_slug),
      categoryCode: String(r.category_code),
      lifecycleStatus: String(r.lifecycle_status),
      summary: r.summary !== null ? String(r.summary) : undefined,
    })
  }
  return mapa
}

/** Diff entre dos bases migradas: cambios para llevar `desde` a `hasta`. */
export function diffDatasets(desde: SqliteDriver, hasta: SqliteDriver): DeltaChange[] {
  const a = vistaDe(desde)
  const b = vistaDe(hasta)
  const cambios: DeltaChange[] = []
  const camposComparables: (keyof DeviceView)[] = ['name', 'manufacturerSlug', 'categoryCode', 'lifecycleStatus', 'summary']
  const datosDe = (v: DeviceView): DeltaChange['datos'] => ({
    name: v.name,
    manufacturerSlug: v.manufacturerSlug,
    categoryCode: v.categoryCode,
    lifecycleStatus: v.lifecycleStatus,
    summary: v.summary,
  })
  for (const dev of b.values()) {
    const prev = a.get(dev.slug)
    if (!prev) {
      cambios.push({ slug: dev.slug, accion: 'alta', datos: datosDe(dev) })
    } else if (camposComparables.some((k) => (prev[k] ?? '') !== (dev[k] ?? ''))) {
      cambios.push({ slug: dev.slug, accion: 'update', datos: datosDe(dev) })
    }
  }
  for (const slug of a.keys()) {
    if (!b.has(slug)) cambios.push({ slug, accion: 'delete' })
  }
  return cambios
}