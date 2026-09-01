import { describe, expect, it } from 'vitest'
import { comprender, normalizar, detectarSlug, extraerVelocidadMbps } from '../src/index.js'

describe('Comprensión NL→plan (F7, §21.1[1])', () => {
  it('normaliza acentos y mayúsculas', () => {
    expect(normalizar('  ¿Qué Es un SWITCH de Capa 3?  ')).toBe('¿que es un switch de capa 3?')
  })

  it('detecta escenario de generación de diagramas', async () => {
    const plan = await comprender('Crea una topología con dos switches, un router y cuatro hosts')
    expect(plan.escenario).toBe('generacion-diagramas')
    expect(plan.llamadas[0]?.herramienta).toBe('build_topology')
  })

  it('detecta comparación con nombre comercial → successors + find_compatible', async () => {
    const plan = await comprender('¿Alternativa moderna al Cisco Catalyst 9300?')
    expect(plan.escenario).toBe('comparacion')
    expect(plan.slugPrincipal).toBe('cisco-c9300-48p')
    expect(plan.llamadas.map((l) => l.herramienta)).toEqual(['successors', 'find_compatible'])
  })

  it('detecta explicación técnica', async () => {
    const plan = await comprender('Explica qué es el Cisco Catalyst 9300')
    expect(plan.escenario).toBe('explicacion-tecnica')
    expect(plan.llamadas.some((l) => l.herramienta === 'get_device')).toBe(true)
  })

  it('ficha explícita "¿qué es X?" → get_device (no explicación)', async () => {
    const plan = await comprender('¿Qué es el Cisco Catalyst 9300?')
    expect(plan.escenario).toBe('busqueda')
    expect(plan.llamadas.map((l) => l.herramienta)).toEqual(['get_device'])
  })

  it('capas OSI explícitas → what_layers', async () => {
    const plan = await comprender('¿Qué capas cubre el Catalyst 9300?')
    expect(plan.llamadas.map((l) => l.herramienta)).toEqual(['what_layers'])
  })

  it('cuántos puertos tiene X → get_device', async () => {
    const plan = await comprender('¿Cuántos puertos tiene el Catalyst 9300?')
    expect(plan.llamadas.map((l) => l.herramienta)).toEqual(['get_device'])
  })

  it('asistente técnico: "necesito conectar por fibra" → búsqueda con medio', async () => {
    const plan = await comprender('¿Qué necesito para conectar dos redes por fibra monomodo?')
    expect(plan.escenario).toBe('asistente-tecnico')
    const dsl = String(plan.llamadas[0]?.argumentos.dsl ?? '')
    expect(dsl).toContain('medio:smf-os2')
  })

  it('búsqueda libre con DSL estructurado (velocidad)', async () => {
    const plan = await comprender('switch con interfaces de 10 Gbps')
    expect(plan.escenario).toBe('busqueda')
    expect(String(plan.llamadas[0]?.argumentos.dsl ?? '')).toContain('velocidad:10000')
  })

  it('texto vacío → no-entendido', async () => {
    expect((await comprender('   ')).escenario).toBe('no-entendido')
  })

  it('detecta slugs por nombre comercial y patrón', () => {
    expect(detectarSlug('aruba 6300m')).toBe('aruba-6300m-48g')
    expect(detectarSlug('mikrotik')).toBe('mikrotik-ccr1036')
  })

  it('extrae velocidades gbps y mbps', () => {
    expect(extraerVelocidadMbps('10gbps')).toBe(10000)
    expect(extraerVelocidadMbps('10 g')).toBe(10000)
    expect(extraerVelocidadMbps('1000 mbps')).toBe(1000)
  })

  it('usa el resolver del adaptador para nombres reales del catálogo', async () => {
    const resolver = async (n: string): Promise<string | undefined> =>
      n.includes('catalyst 9300') ? 'cisco-catalyst-9300-48p' : undefined
    const plan = await comprender('¿Qué capas cubre Cisco Catalyst 9300?', resolver)
    expect(plan.llamadas.map((l) => l.herramienta)).toEqual(['what_layers'])
    expect(plan.slugPrincipal).toBe('cisco-catalyst-9300-48p')
  })
})