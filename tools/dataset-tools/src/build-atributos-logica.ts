import type { CatalogDao } from '@netatlas/data'
import type { SeedDevice, SeedPort } from './lint-tipos.js'

/**
 * Lógica de EAV (§9.4): extraída de `build-atributos.ts` para mantener el
 * módulo principal por debajo del límite de 200 líneas (§Convenciones).
 *
 * Tres concerns separados:
 * 1. `seedNumericAttributes` — assertions numéricas → facetas numéricas.
 * 2. `seedStackableFacet` — rol/apilable en familias de switching.
 * 3. `seedInventarioFacts` — conteos de puertos derivados honestamente.
 */

/** Metadatos por clave de assertion numérica: label, unidad, regla de comparación. */
export const META_ATRIBUTO: Record<string, { label: string; unit?: string; rule: 'higher-better' | 'lower-better' }> = {
  throughput_gbps: { label: 'Capacidad de conmutación', unit: 'Gbps', rule: 'higher-better' },
  switching_capacity_gbps: { label: 'Capacidad de conmutación', unit: 'Gbps', rule: 'higher-better' },
  poe_budget_w: { label: 'Presupuesto PoE', unit: 'W', rule: 'higher-better' },
  routing_throughput_mbps: { label: 'Rendimiento de ruteo', unit: 'Mbps', rule: 'higher-better' },
  firewall_throughput_gbps: { label: 'Rendimiento de firewall', unit: 'Gbps', rule: 'higher-better' },
  vpn_throughput_gbps: { label: 'Rendimiento VPN', unit: 'Gbps', rule: 'higher-better' },
  wifi_max_rate_mbps: { label: 'Tasa máxima inalámbrica', unit: 'Mbps', rule: 'higher-better' },
  power_consumption_w: { label: 'Consumo', unit: 'W', rule: 'lower-better' },
  mac_table_entries: { label: 'Entradas de tabla MAC', rule: 'higher-better' },
  sessions_per_sec: { label: 'Sesiones por segundo', rule: 'higher-better' },
}

/** Copia assertions numéricas como facetas numéricas de la categoría. */
export function seedNumericAttributes(
  dao: CatalogDao,
  dev: SeedDevice,
  meta: Record<string, { label: string; unit?: string; rule: 'higher-better' | 'lower-better' }>,
): void {
  for (const assertion of dev.assertions ?? []) {
    const m = meta[assertion.predicate]
    if (!m || typeof assertion.value !== 'number') continue
    dao.defineAttribute({
      categoryCode: dev.categoryCode,
      key: assertion.predicate,
      labelEs: m.label,
      valueType: 'number',
      unit: m.unit,
      isFacet: true,
      isComparable: true,
      compareRule: m.rule,
    })
    dao.setDeviceAttribute(dev.slug, assertion.predicate, assertion.value)
  }
}

/** Faceta enum 'stackable' en familias de switching (CAT-SWT-*). */
export function seedStackableFacet(dao: CatalogDao, dev: SeedDevice): void {
  if (!dev.categoryCode.startsWith('CAT-SWT')) return
  const apilable =
(dev.ports ?? []).some((p: SeedPort) => p.role === 'stack') ||
    /apilab|stackable|\bstack\b/i.test(dev.summary ?? '')
  dao.defineAttribute({
    categoryCode: dev.categoryCode,
    key: 'stackable',
    labelEs: 'Apilable',
    valueType: 'enum',
    enumValues: ['sí', 'no'],
    isFacet: true,
    isComparable: true,
    compareRule: 'set-compare',
  })
  dao.setDeviceAttribute(dev.slug, 'stackable', apilable ? 'sí' : 'no')
}

/** Hechos de inventario computados: conteo total, uplinks y velocidad máxima. */
export function seedInventarioFacts(dao: CatalogDao, dev: SeedDevice): void {
  const puertos = dev.ports ?? []
  if (puertos.length === 0) return
  const total = puertos.reduce((s: number, p: SeedPort) => s + (p.quantity ?? 0), 0)
  const uplinks = puertos.filter((p: SeedPort) => p.role === 'uplink').reduce((s: number, p: SeedPort) => s + (p.quantity ?? 0), 0)
  const maxSpeed = Math.max(0, ...puertos.flatMap((p: SeedPort) => p.speedsMbps ?? []))
  const inv = (key: string, labelEs: string, value: number, unit?: string): void => {
    dao.defineAttribute({
      categoryCode: dev.categoryCode,
      key,
      labelEs,
      valueType: 'number',
      unit,
      isFacet: true,
      isComparable: false,
      compareRule: 'none',
    })
    dao.setDeviceAttribute(dev.slug, key, value)
  }
  inv('port_count', 'Puertos (inventario)', total)
  inv('uplink_ports', 'Puertos uplink', uplinks)
  if (maxSpeed > 0) inv('max_port_speed_mbps', 'Velocidad máxima de puerto', maxSpeed, 'Mbps')
}
