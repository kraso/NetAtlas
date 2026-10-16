import type { SqliteDriver } from '../driver.js'
import { categoryId, manufacturerId, sourceId } from './catalog-maestros.js'
import type { DatasheetSeedRow, DeviceRow, ImageSeedRow, PortRow } from './catalog-tipos.js'

/**
 * Dispositivos y su inventario (puertos, datasheets, imágenes): funciones
 * libres sobre el driver que `CatalogDao` delega sin cambiar su API.
 *
 * `ahora` (ISO 8601) entra por parámetro y no se lee del reloj interno: es el
 * `updated_at` que viaja al archivo del dataset, y el build lo sella con un
 * reloj fijo para que dos construcciones de las mismas fuentes coincidan.
 */

export function upsertDevice(db: SqliteDriver, row: DeviceRow, ahora: string = new Date().toISOString()): number {
  const mfrId = manufacturerId(db, row.manufacturerSlug)
  if (mfrId === undefined) {
    throw new Error(`Device "${row.slug}": fabricante desconocido "${row.manufacturerSlug}".`)
  }
  const catId = categoryId(db, row.categoryCode)
  if (catId === undefined) {
    throw new Error(`Device "${row.slug}": categoría desconocida "${row.categoryCode}".`)
  }
  const existing = db.prepare('SELECT id FROM device WHERE slug = ?').get(row.slug) as { id: number } | undefined
  if (existing) {
    // Actualización (delta/importación): refresca los campos esenciales del catálogo.
    db.prepare(
      `UPDATE device SET name = ?, manufacturer_id = ?, category_id = ?, lifecycle_status = ?,
               osi_profile_json = ?, summary = ?, model = ?, sku = ?, updated_at = ? WHERE id = ?`,
    ).run(row.name, mfrId, catId, row.lifecycleStatus, row.osiProfileJson ?? null, row.summary ?? null, row.model ?? null, row.sku ?? null, ahora, Number(existing.id))
    return Number(existing.id)
  }
  const res = db
    .prepare(
      `INSERT INTO device (slug, name, manufacturer_id, category_id, lifecycle_status,
                           osi_profile_json, summary, model, sku, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.slug, row.name, mfrId, catId, row.lifecycleStatus, row.osiProfileJson ?? null, row.summary ?? null, row.model ?? null, row.sku ?? null, ahora, ahora)
  return Number(res.lastInsertRowid)
}

export function deviceId(db: SqliteDriver, slug: string): number | undefined {
  const row = db.prepare('SELECT id FROM device WHERE slug = ?').get(slug)
  return row ? Number(row.id) : undefined
}

/** Borra un dispositivo con todo su rastro (puertos, atributos, relaciones, assertions). */
export function eliminarDeviceCompleto(db: SqliteDriver, slug: string): boolean {
  const id = deviceId(db, slug)
  if (id === undefined) return false
  // Sin transacción propia: el caller (applyDelta/lote) aporta atomicidad.
  db.prepare("DELETE FROM assertion WHERE subject_type = 'device' AND subject_id = ?").run(id)
  db.prepare("DELETE FROM relationship WHERE (subject_type = 'device' AND subject_id = ?) OR (object_type = 'device' AND object_id = ?)").run(id, id)
  // Puertos/atributos/roles usan ON DELETE CASCADE; device lo confirma.
  db.prepare('DELETE FROM device WHERE id = ?').run(id)
  return true
}

/** Convierte una lista de dispositivos en masa (p. ej. sintéticos). */
export function bulkInsertDevices(db: SqliteDriver, rows: readonly DeviceRow[], ahora: string = new Date().toISOString()): void {
  db.transaction(() => {
    for (const row of rows) upsertDevice(db, row, ahora)
  })
}

// ── Puertos ────────────────────────────────────────────────────────────

/** Elimina todos los puertos de un dispositivo (reemplazo idempotente de inventario). */
export function clearPorts(db: SqliteDriver, deviceSlug: string): void {
  const id = deviceId(db, deviceSlug)
  if (id === undefined) throw new Error(`clearPorts: dispositivo desconocido "${deviceSlug}".`)
  db.prepare('DELETE FROM port WHERE device_id = ?').run(id)
}

export function addPort(db: SqliteDriver, row: PortRow): void {
  const id = deviceId(db, row.deviceSlug)
  if (id === undefined) throw new Error(`addPort: dispositivo desconocido "${row.deviceSlug}".`)
  let interfaceId = db.prepare('SELECT id FROM interface WHERE code = ?').get(row.interfaceCode) as { id: number } | undefined
  if (!interfaceId) {
    const res = db
      .prepare('INSERT INTO interface (code, kind) VALUES (?, ?)')
      .run(row.interfaceCode, row.interfaceCode.startsWith('sfp') || row.interfaceCode.includes('10g') ? 'fibra' : 'ethernet')
    interfaceId = { id: Number(res.lastInsertRowid) }
  }
  db.prepare(
    `INSERT INTO port (device_id, interface_id, label, quantity, speeds_json, poe_standard, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, interfaceId.id, row.label, row.quantity, JSON.stringify(row.speedsMbps), row.poeStandard ?? null, row.role ?? null)
}

// ── Datasheets e imágenes ──────────────────────────────────────────────

/** Inserta un datasheet de dispositivo (resuelve device + fuente). */
export function addDatasheet(db: SqliteDriver, row: DatasheetSeedRow): number {
  const id = deviceId(db, row.deviceSlug)
  if (id === undefined) throw new Error(`addDatasheet: dispositivo desconocido "${row.deviceSlug}".`)
  const srcId = sourceId(db, row.sourceSlug)
  if (srcId === undefined) throw new Error(`addDatasheet: fuente desconocida "${row.sourceSlug}".`)
  const res = db
    .prepare(
      `INSERT INTO datasheet (device_id, title, language, source_id, local_path, url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, row.title, row.language ?? 'es', srcId, row.localPath ?? null, row.url ?? null)
  return Number(res.lastInsertRowid)
}

/** Inserta una imagen de dispositivo (resuelve device + fuente). */
export function addImage(db: SqliteDriver, row: ImageSeedRow): number {
  const id = deviceId(db, row.deviceSlug)
  if (id === undefined) throw new Error(`addImage: dispositivo desconocido "${row.deviceSlug}".`)
  const srcId = sourceId(db, row.sourceSlug)
  if (srcId === undefined) throw new Error(`addImage: fuente desconocida "${row.sourceSlug}".`)
  const res = db
    .prepare(
      `INSERT INTO image (content_hash, device_id, kind, caption, source_id, attribution, local_path, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(`seed:${row.deviceSlug}:${row.localPath ?? row.url ?? row.kind}`, id, row.kind, row.caption ?? null, srcId, null, row.localPath ?? null, row.url ?? null)
  return Number(res.lastInsertRowid)
}
