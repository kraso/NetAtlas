import { describe, expect, it } from 'vitest'
import { extraerRoles, parsearSpec, validarSpecJSON, generarTopologia, capaDeRol } from '../src/index.js'
import type { GeneradorContexto, TopologiaSpec } from '../src/index.js'

const ctx: GeneradorContexto = {
  async resolverRol(rol: string, instancia: number) {
    if (rol === 'switch') {
      return instancia === 0
        ? { entitySlug: 'aruba-2930f-48g', entityName: 'Aruba 2930F' }
        : { entitySlug: 'cisco-c9300-48p', entityName: 'Cisco 9300' }
    }
    if (rol === 'router') return { entitySlug: 'mikrotik-ccr1036', entityName: 'MikroTik CCR1036' }
    if (rol === 'ap') return { entitySlug: 'cisco-9120axi', entityName: 'Cisco 9120AXI' }
    return undefined
  },
  async velocidadesDe(slug: string) {
    if (slug === 'aruba-2930f-48g' || slug === 'mikrotik-ccr1036' || slug === 'cisco-c9300-48p') return [1000, 10000]
    if (slug === 'cisco-9120axi') return [1000]
    return []
  },
}

describe('Generación de topologías por lenguaje (F7, NET-HW-061)', () => {
  it('extrae roles con cantidades: "dos switches, un router y cuatro hosts"', () => {
    const roles = extraerRoles('dos switches, un router y cuatro hosts')
    expect(roles).toEqual([
      { rol: 'switch', cantidad: 2 },
      { rol: 'router', cantidad: 1 },
      { rol: 'host', cantidad: 4 },
    ])
  })

  it('parsea números en dígitos y singular', () => {
    const roles = extraerRoles('2 aps y 1 firewall')
    expect(roles).toContainEqual({ rol: 'ap', cantidad: 2 })
    expect(roles).toContainEqual({ rol: 'firewall', cantidad: 1 })
  })

  it('valida una especificación JSON bien formada y rechaza malformadas', () => {
    const buena = validarSpecJSON({ name: 'X', roles: [{ rol: 'switch', cantidad: 2 }] })
    expect(buena).toEqual({ name: 'X', roles: [{ rol: 'switch', cantidad: 2 }] })
    expect(validarSpecJSON({ name: 'X' })).toBeUndefined()
    expect(validarSpecJSON({ name: 'X', roles: [{ rol: 'switch', cantidad: 0 }] })).toBeUndefined()
    expect(validarSpecJSON(null)).toBeUndefined()
  })

  it('parsea texto libre a especificación', () => {
    const spec = parsearSpec('Topología con dos switches, un router y cuatro hosts', 'Red IA')
    expect(spec.name).toBe('Red IA')
    expect(spec.roles).toContainEqual({ rol: 'switch', cantidad: 2 })
    expect(spec.roles).toContainEqual({ rol: 'host', cantidad: 4 })
  })

  it('genera topología válida resolviendo entidades reales y validando enlaces', async () => {
    const spec: TopologiaSpec = { name: 'Red de prueba', roles: [{ rol: 'switch', cantidad: 2 }, { rol: 'router', cantidad: 1 }] }
    const r = await generarTopologia(spec, ctx)
    expect(r.ok).toBe(true)
    const t = r.topologia!
    expect(t.nodes.length).toBe(3)
    expect(t.kind).toBe('user')
    expect(t.edges.length).toBe(2)
    // nodos únicos y aristas bien formadas (invariantes del agregado)
    expect(new Set(t.nodes.map((n) => n.id)).size).toBe(3)
  })

  it('rechaza roles sin resolución → ok=false con sinResolver', async () => {
    const spec: TopologiaSpec = { name: 'X', roles: [{ rol: 'host', cantidad: 3 }] }
    const r = await generarTopologia(spec, ctx)
    expect(r.ok).toBe(false)
    expect(r.sinResolver).toContain('host')
  })

  it('rechaza enlace sin interfaz común', async () => {
    const ctxSinComun: GeneradorContexto = {
      resolverRol: async (rol) =>
        rol === 'switch'
          ? { entitySlug: 'aruba-2930f-48g', entityName: 'Aruba 2930F' }
          : { entitySlug: 'cisco-9120axi', entityName: 'Cisco 9120AXI' },
      velocidadesDe: async (slug) => (slug === 'aruba-2930f-48g' ? [1000] : []),
    }
    const spec: TopologiaSpec = { name: 'X', roles: [{ rol: 'switch', cantidad: 1 }, { rol: 'ap', cantidad: 1 }] }
    const r = await generarTopologia(spec, ctxSinComun)
    expect(r.ok).toBe(false)
    expect(r.razon).toContain('Sin interfaz común')
  })

  it('capaDeRol asigna hints de layout correctos', () => {
    expect(capaDeRol('firewall')).toBe(4)
    expect(capaDeRol('router')).toBe(3)
    expect(capaDeRol('switch')).toBe(2)
    expect(capaDeRol('host')).toBe(7)
  })
})