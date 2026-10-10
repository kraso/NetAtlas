import type { SqliteDriver } from '../driver.js'
import { Device, OsiProfileValue, Port, requireLifecycleStatus } from '@netatlas/domain'

/**
 * Mapeo del repositorio SQLite de dispositivos (NET-HW-003): filas del esquema
 * canónico → entidades de dominio congeladas. El SQL corre igual en
 * node:sqlite (desktop/CLI) y wa-sqlite (PWA, F1).
 */

export interface DeviceRow {
  id: number
  slug: string
  name: string
  commercial_name: string | null
  manufacturer_slug: string
  family_slug: string | null
  category_code: string
  lifecycle_status: string
  osi_profile_json: string | null
  summary: string | null
  model: string | null
  sku: string | null
  released_on: string | null
  eol_on: string | null
  eos_on: string | null
}

export interface PortRow {
  label: string
  interface_code: string
  quantity: number
  speeds_json: string
  poe_standard: string | null
  role: string | null
  notes: string | null
}

export const DEVICE_SELECT = `
  SELECT d.id, d.slug, d.name, d.commercial_name, d.model, d.sku,
         d.released_on, d.eol_on, d.eos_on, d.lifecycle_status,
         d.osi_profile_json, d.summary,
         m.slug AS manufacturer_slug, f.slug AS family_slug,
         c.code AS category_code
  FROM device d
  JOIN manufacturer m ON m.id = d.manufacturer_id
  LEFT JOIN product_family f ON f.id = d.family_id
  JOIN category c ON c.id = d.category_id
`

/** Fila de dispositivo + sus puertos → `Device` de dominio. */
export function toDevice(db: SqliteDriver, row: DeviceRow): Device {
  return Device.hydrate({
    slug: row.slug,
    name: row.name,
    commercialName: row.commercial_name ?? undefined,
    manufacturerSlug: row.manufacturer_slug,
    familySlug: row.family_slug ?? undefined,
    categoryCode: row.category_code,
    model: row.model ?? undefined,
    sku: row.sku ?? undefined,
    releasedOn: row.released_on ?? undefined,
    eolOn: row.eol_on ?? undefined,
    eosOn: row.eos_on ?? undefined,
    lifecycleStatus: requireLifecycleStatus(row.lifecycle_status),
    osiProfile: row.osi_profile_json
      ? OsiProfileValue.create(JSON.parse(row.osi_profile_json) as Parameters<typeof OsiProfileValue.create>[0])
      : undefined,
    summary: row.summary ?? undefined,
    ports: puertosDe(db, row.id),
  })
}

/** Puertos persistidos de un dispositivo, en orden de creación. */
function puertosDe(db: SqliteDriver, deviceId: number): Port[] {
  const rows = db
    .prepare(
      `SELECT p.label, i.code AS interface_code, p.quantity, p.speeds_json, p.poe_standard, p.role, p.notes
       FROM port p JOIN interface i ON i.id = p.interface_id
       WHERE p.device_id = ? ORDER BY p.id`,
    )
    .all(deviceId) as unknown as PortRow[]
  return rows.map(toPort)
}

/** Fila de puerto → `Port` de dominio. */
function toPort(p: PortRow): Port {
  return Port.create({
    label: p.label,
    interfaceCode: p.interface_code,
    quantity: Number(p.quantity),
    speedsMbps: (JSON.parse(p.speeds_json) as number[]).map(Number),
    poeStandard: (p.poe_standard ?? undefined) as '802.3af' | '802.3at' | '802.3bt' | undefined,
    role: (p.role ?? undefined) as 'access' | 'uplink' | 'mgmt' | 'console' | 'stack' | undefined,
    notes: p.notes ?? undefined,
  })
}

/** Infiere el kind de una interfaz por su código (misma heurística que el DAO). */
export function inferInterfaceKind(code: string): string {
  if (code.startsWith('sfp') || code.includes('10g')) return 'fibra'
  if (code.startsWith('rj') || code.startsWith('coaxial')) return 'ethernet'
  if (code === 'console') return 'consola'
  if (code.startsWith('usb')) return 'usb'
  if (code === 'serial') return 'serial'
  if (code.startsWith('wifi')) return 'wifi'
  return 'ethernet'
}