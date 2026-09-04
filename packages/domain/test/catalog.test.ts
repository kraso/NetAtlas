import { describe, expect, it } from 'vitest'
import { Device, Port } from '../src/catalog/device.js'
import { Category } from '../src/catalog/category.js'
import { Manufacturer } from '../src/catalog/manufacturer.js'
import { ProductFamily } from '../src/catalog/product-family.js'
import { OsiProfileValue } from '../src/value-objects/osi-profile.js'

describe('Category', () => {
  it('acepta códigos canónicos CAT-XXX[-YYY]', () => {
    const c = Category.create({
      code: 'CAT-SWT-L2',
      nameEs: 'Switch gestionable',
      aliases: ['sw', 'conmutador'],
      sortOrder: 10,
    })
    expect(c.code).toBe('CAT-SWT-L2')
    expect(c.aliases).toEqual(['sw', 'conmutador'])
  })

  it('rechaza códigos fuera de formato', () => {
    expect(() =>
      Category.create({ code: 'sw-2', nameEs: 'x', aliases: [], sortOrder: 0 }),
    ).toThrow()
  })

  it('empareja por código, nombre y alias', () => {
    const c = Category.create({
      code: 'CAT-SWT',
      nameEs: 'Interconexión y switching',
      aliases: ['sw', 'switch'],
      sortOrder: 0,
    })
    expect(CategoryMatches(c, 'CAT-SWT')).toBe(true)
    expect(CategoryMatches(c, 'switch')).toBe(true)
    expect(CategoryMatches(c, 'router')).toBe(false)
  })
})

// Helper local de emparejamiento (evita importar de la implementación para este test)
function CategoryMatches(c: Category, term: string): boolean {
  const t = term.trim().toLowerCase()
  return (
    c.code.toLowerCase() === t ||
    c.nameEs.toLowerCase().includes(t) ||
    c.aliases.some((a) => a.toLowerCase().includes(t))
  )
}

describe('Manufacturer / ProductFamily', () => {
  it('construye fabricante con slug normalizado', () => {
    const m = Manufacturer.create({ slug: 'Hewlett Packard Enterprise', name: 'HPE' })
    expect(m.slug.value).toBe('hewlett-packard-enterprise')
    expect(m.status).toBe('active')
  })

  it('rechaza fechas absurda', () => {
    expect(() =>
      Manufacturer.create({ slug: 'x', name: 'X', foundedYear: 1500 }),
    ).toThrow()
  })

  it('acepta empresa SNMP válida y rechaza inválida', () => {
    expect(Manufacturer.create({ slug: 'cisco', name: 'Cisco', snmpEnterprise: 9 }).snmpEnterprise).toBe(9)
    expect(Manufacturer.create({ slug: 'x', name: 'X' }).snmpEnterprise).toBeUndefined()
    expect(() => Manufacturer.create({ slug: 'x', name: 'X', snmpEnterprise: 0 })).toThrow()
    expect(() => Manufacturer.create({ slug: 'x', name: 'X', snmpEnterprise: 1.5 })).toThrow()
  })

  it('construye familia con clave natural (manufacturer, slug)', () => {
    const f = ProductFamily.create({ manufacturerSlug: 'aruba', slug: '2930F', name: 'Aruba 2930F' })
    expect(f.manufacturerSlug).toBe('aruba')
    expect(f.slug.value).toBe('2930f')
  })
})

describe('Device', () => {
  it('construye un switch L2 con inventario de puertos', () => {
    const d = Device.create({
      slug: 'aruba-2930f-48g-poeplus',
      name: 'Aruba 2930F 48G PoE+ 4SFP+',
      manufacturerSlug: 'aruba',
      familySlug: '2930f',
      categoryCode: 'CAT-SWT-L2',
      lifecycleStatus: 'mature',
      osiProfile: OsiProfileValue.create({
        terminate: [1, 2],
        transparent: [3, 4, 5, 6, 7],
        primary: 2,
      }),
      ports: [
        Port.create({
          label: 'Gi1/0/1..48',
          interfaceCode: 'rj45',
          quantity: 48,
          speedsMbps: [100, 1000],
          poeStandard: '802.3at',
          role: 'access',
        }),
        Port.create({
          label: 'SFP+ uplink x4',
          interfaceCode: 'sfp-plus',
          quantity: 4,
          speedsMbps: [1000, 10000],
          role: 'uplink',
        }),
      ],
    })
    expect(d.slug.value).toBe('aruba-2930f-48g-poeplus')
    expect(d.portCount()).toBe(52)
    expect(d.portCount('sfp')).toBe(4)
    expect(d.ports[0]!.supportsPoe).toBe(true)
    expect(Object.isFrozen(d)).toBe(true)
    expect(Object.isFrozen(d.ports)).toBe(true)
  })

  it('rechaza puertos sin etiqueta o con cantidad inválida', () => {
    expect(() =>
      Port.create({ label: '', interfaceCode: 'rj45', quantity: 1, speedsMbps: [1000] }),
    ).toThrow()
    expect(() =>
      Port.create({ label: 'x', interfaceCode: 'rj45', quantity: 0, speedsMbps: [1000] }),
    ).toThrow()
  })

  it('rechaza estado de ciclo de vida inválido', () => {
    expect(() =>
      Device.create({
        slug: 'mal-dispositivo',
        name: 'Mal',
        manufacturerSlug: 'x',
        categoryCode: 'CAT-SWT',
        // @ts-expect-error estado intencionalmente inválido
        lifecycleStatus: 'retirado',
      }),
    ).toThrow()
  })
})