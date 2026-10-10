import { Category, Device as DeviceEntity, Manufacturer, OsiProfileValue, Port } from '@netatlas/domain'
import type { Device, SyncDevice, SyncDeviceDetail, SyncPort } from '@netatlas/domain'

/**
 * Mapeo del snapshot (F8B) a entidades del dominio. El dispositivo es el
 * núcleo del dataset: una fila inválida rompe el pull (fallo fuerte y
 * temprano). Las colecciones derivadas (puertos, recursos, trazabilidad)
 * descartan sus filas inválidas y las registran con contexto.
 */

/** Puerto del snapshot → Port (fila inválida → undefined, sin tumbar el pull). */
export function toPort(p: SyncPort): Port | undefined {
  try {
    return Port.create({
      label: p.label,
      interfaceCode: p.interfaceCode,
      quantity: p.quantity,
      speedsMbps: [...p.speedsMbps],
      poeStandard: (p.poeStandard ?? undefined) as Port['poeStandard'],
      role: (p.role ?? undefined) as Port['role'],
      notes: p.notes ?? undefined,
    })
  } catch (error) {
    // Best-effort explícito: un puerto fuera de contrato se descarta del pull.
    console.warn(`[WARN] puerto inválido en el pull F8B: ${p.label} (${p.interfaceCode})`, { error })
    return undefined
  }
}

/** Snapshot SyncDevice (+ detalle F8B-detalle) → Device del dominio. */
export function toDevice(sd: SyncDevice, det?: SyncDeviceDetail): Device {
  let osiProfile = undefined
  if (det?.osiProfileJson) {
    try {
      osiProfile = OsiProfileValue.create(JSON.parse(det.osiProfileJson) as Parameters<typeof OsiProfileValue.create>[0])
    } catch (error) {
      // Best-effort explícito: sin perfil OSI válido la ficha sigue sirviendo.
      console.warn(`[WARN] perfil OSI inválido en el pull F8B: ${sd.slug}`, { error })
      osiProfile = undefined
    }
  }
  return DeviceEntity.create({
    slug: sd.slug,
    name: sd.name,
    manufacturerSlug: sd.manufacturerSlug,
    categoryCode: sd.categoryCode,
    lifecycleStatus: sd.lifecycleStatus as Device['lifecycleStatus'],
    summary: det?.summary ?? undefined,
    osiProfile,
    ports: (det?.ports ?? []).flatMap((p) => {
      const port = toPort(p)
      return port ? [port] : []
    }),
  })
}

/** Jerarquía implícita en el código: CAT-SWT-L3 → CAT-SWT-L2 → CAT-SWT. */
export function parentCodeDe(code: string): string | undefined {
  const partes = code.split('-')
  if (partes.length <= 1) return undefined
  return partes.slice(0, -1).join('-')
}

/**
 * Deriva fabricantes y categorías únicos del snapshot (el API /api/categories
 * también sirve categorías; aquí se fusionan ambos: nombres del API + jerarquía
 * derivada de los códigos CAT-XXX-YYY para que el árbol UI muestre las 4
 * macrocategorías raíz, no 26 hojas).
 */
export function derivarCatalogo(
  dispositivos: readonly Device[],
  categoriasApi: readonly { code: string; nameEs: string; parentCode?: string }[],
  empresasApi: readonly { slug: string; snmpEnterprise?: number | undefined }[] = [],
): { manufacturers: readonly Manufacturer[]; categories: readonly Category[] } {
  const mSlugs = new Map<string, { slug: string; name: string }>()
  const cNames = new Map<string, string>()
  for (const c of categoriasApi) cNames.set(c.code, c.nameEs)
  for (const d of dispositivos) {
    if (!mSlugs.has(d.manufacturerSlug)) mSlugs.set(d.manufacturerSlug, { slug: d.manufacturerSlug, name: d.manufacturerSlug })
    if (!cNames.has(d.categoryCode)) cNames.set(d.categoryCode, d.categoryCode)
  }
  const categories = categoriasDe(cNames)
  const empresas = new Map(empresasApi.map((e) => [e.slug, e.snmpEnterprise]))
  const manufacturers: Manufacturer[] = [...mSlugs.values()].map((m) =>
    Manufacturer.create({ slug: m.slug, name: m.name, snmpEnterprise: empresas.get(m.slug) ?? undefined }),
  )
  return { manufacturers, categories }
}

/** Categorías con jerarquía implícita en el código (padre solo si existe). */
function categoriasDe(cNames: ReadonlyMap<string, string>): Category[] {
  const codes = Array.from(cNames.keys())
  return codes.map((code) => {
    const parent = parentCodeDe(code)
    const hasParent = codes.includes(parent ?? '')
    return Category.hydrate({
      code,
      nameEs: cNames.get(code) ?? code,
      parentCode: parent && hasParent ? parent : undefined,
      aliases: [],
      sortOrder: 0,
    })
  })
}
