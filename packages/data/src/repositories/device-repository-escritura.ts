import type { SqliteDriver } from '../driver.js'
import type { Device } from '@netatlas/domain'
import { inferInterfaceKind } from './device-repository-mapeo.js'

/**
 * Escritura del repositorio SQLite de dispositivos (NET-HW-003): upsert del
 * dispositivo y reemplazo completo de su inventario de puertos (idempotente).
 */

/** Fabricante y categoría deben existir; si no, el guardado rompe fuerte. */
export function guardarDevice(db: SqliteDriver, device: Device): void {
  const manufacturerId = db.prepare('SELECT id FROM manufacturer WHERE slug = ?').get(device.manufacturerSlug)
  const categoryId = db.prepare('SELECT id FROM category WHERE code = ?').get(device.categoryCode)
  if (!manufacturerId || !categoryId) {
    throw new Error(`save: fabricante o categoría inexistente para "${device.slug}".`)
  }
  upsertDispositivo(db, device, Number(manufacturerId.id), Number(categoryId.id))
  const deviceId = deviceIdFor(db, device.slug.value)
  if (deviceId !== undefined) guardarPuertos(db, device, deviceId)
}

/** Upsert del registro del dispositivo (con timestamps de creación/actualización). */
function upsertDispositivo(db: SqliteDriver, device: Device, manufacturerId: number, categoryId: number): void {
  const now = new Date().toISOString()
  db
    .prepare(
      `INSERT INTO device (slug, name, commercial_name, manufacturer_id, category_id,
                           lifecycle_status, osi_profile_json, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         commercial_name = excluded.commercial_name,
         manufacturer_id = excluded.manufacturer_id,
         category_id = excluded.category_id,
         lifecycle_status = excluded.lifecycle_status,
         osi_profile_json = excluded.osi_profile_json,
         summary = excluded.summary,
         updated_at = excluded.updated_at`,
    )
    .run(
      device.slug.value,
      device.name,
      device.commercialName ?? null,
      manufacturerId,
      categoryId,
      device.lifecycleStatus,
      device.osiProfile ? JSON.stringify(device.osiProfile.profile) : null,
      device.summary ?? null,
      now,
      now,
    )
}

/** Inventario de puertos: reemplazo completo (idempotente). */
function guardarPuertos(db: SqliteDriver, device: Device, deviceId: number): void {
  db.prepare('DELETE FROM port WHERE device_id = ?').run(deviceId)
  for (const port of device.ports) {
    const interfaceId = interfaceIdDe(db, port.interfaceCode)
    db
      .prepare(
        `INSERT INTO port (device_id, interface_id, label, quantity, speeds_json, poe_standard, role, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        deviceId,
        interfaceId,
        port.label,
        port.quantity,
        JSON.stringify(port.speedsMbps),
        port.poeStandard ?? null,
        port.role ?? null,
        port.notes ?? null,
      )
  }
}

/** Id de la interfaz del código, creándola con su kind inferido si falta. */
function interfaceIdDe(db: SqliteDriver, code: string): number {
  const found = db.prepare('SELECT id FROM interface WHERE code = ?').get(code) as { id: number } | undefined
  if (found) return Number(found.id)
  const res = db.prepare('INSERT INTO interface (code, kind) VALUES (?, ?)').run(code, inferInterfaceKind(code))
  const id = Number(res.lastInsertRowid)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`save: no se pudo crear la interfaz "${code}".`)
  }
  return id
}

/** Id numérico del dispositivo por slug. */
function deviceIdFor(db: SqliteDriver, slug: string): number | undefined {
  const row = db.prepare('SELECT id FROM device WHERE slug = ?').get(slug)
  return row ? Number((row as { id: number }).id) : undefined
}