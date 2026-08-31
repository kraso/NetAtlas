import { describe, expect, it } from 'vitest'
import { parseDsl, textoLibre } from '../src/search/parser.js'
import type { ConsultaDsl } from '../src/search/ast.js'

function mustParse(input: string): ConsultaDsl {
  const res = parseDsl(input)
  expect(res.ok, JSON.stringify(res.errores)).toBe(true)
  return res.ast!
}

describe('parseDsl — sintaxis básica', () => {
  it('parsea texto libre', () => {
    const ast = mustParse('switch 48 puertos')
    expect(ast.terminos.filter((t) => t.kind === 'texto')).toHaveLength(3)
    expect(textoLibre(ast)).toBe('switch 48 puertos')
  })

  it('parsea igualdad de campo', () => {
    const ast = mustParse('cat:sw')
    expect(ast.terminos[0]).toEqual({ kind: 'igual', clave: 'cat', valor: 'sw' })
  })

  it('parsea valores entre comillas', () => {
    const ast = mustParse('protocolo:"ospf v2"')
    const t = ast.terminos[0]!
    expect(t.kind).toBe('igual')
    expect(t).toEqual({ kind: 'igual', clave: 'protocolo', valor: 'ospf v2' })
  })

  it('parsea rango numérico', () => {
    const ast = mustParse('velocidad:10..25')
    expect(ast.terminos[0]).toEqual({ kind: 'rango', clave: 'velocidad', desde: 10, hasta: 25 })
  })

  it('parsea negación y requerido', () => {
    const ast = mustParse('-estado:discontinued +protocolo:bgp')
    expect(ast.terminos[0]).toEqual({
      kind: 'negacion',
      operando: { kind: 'igual', clave: 'estado', valor: 'discontinued' },
    })
    expect(ast.terminos[1]).toEqual({
      kind: 'requerido',
      operando: { kind: 'igual', clave: 'protocolo', valor: 'bgp' },
    })
  })

  it('es insensible a mayúsculas en claves', () => {
    const ast = mustParse('CAT:sw')
    expect(ast.terminos[0]).toEqual({ kind: 'igual', clave: 'cat', valor: 'sw' })
  })
})

describe('parseDsl — las 7 consultas canónicas del brief (§12.3)', () => {
  it('Q1: switches 48 puertos con PoE', () => {
    const ast = mustParse('cat:sw +puertos:48 +poe:*')
    const iguales = ast.terminos.filter((t) => t.kind === 'igual')
    expect(iguales).toHaveLength(1) // cat
    const req = ast.terminos.filter((t) => t.kind === 'requerido')
    expect(req).toHaveLength(2) // puertos + poe
  })

  it('Q2: routers con BGP y OSPF (dos requeridos = AND)', () => {
    const ast = mustParse('cat:rtr +protocolo:bgp +protocolo:ospf')
    const req = ast.terminos.filter((t) => t.kind === 'requerido')
    expect(req).toHaveLength(2)
    expect(req.map((t) => (t as { operando: { valor: string } }).operando.valor).sort()).toEqual(['bgp', 'ospf'])
  })

  it('Q3: dispositivos en capa 2 y 3 → rango', () => {
    const ast = mustParse('capa:2..3')
    expect(ast.terminos[0]).toEqual({ kind: 'rango', clave: 'capa', desde: 2, hasta: 3 })
  })

  it('Q4: interfaces de red de 10 Gbps', () => {
    const ast = mustParse('cat:ifc velocidad:10')
    expect(ast.terminos).toHaveLength(2)
  })

  it('Q5: hardware compatible con fibra monomodo', () => {
    const ast = mustParse('medio:smf')
    expect(ast.terminos[0]).toEqual({ kind: 'igual', clave: 'medio', valor: 'smf' })
  })

  it('Q6: equipos para redes industriales (hereda subcategorías)', () => {
    const ast = mustParse('cat:ind')
    expect(ast.terminos[0]).toEqual({ kind: 'igual', clave: 'cat', valor: 'ind' })
  })

  it('Q7: dispositivos con IPv6 y VXLAN (dos requeridos)', () => {
    const ast = mustParse('+protocolo:ipv6 +protocolo:vxlan')
    const req = ast.terminos.filter((t) => t.kind === 'requerido')
    expect(req).toHaveLength(2)
  })
})

describe('parseDsl — errores explicados', () => {
  it('campo desconocido con sugerencia', () => {
    const res = parseDsl('protocol0:ospf')
    expect(res.ok).toBe(false)
    expect(res.errores[0]!.message).toContain('Campo desconocido')
    expect(res.errores[0]!.suggestion).toBeDefined()
  })

  it('modificador sin operando', () => {
    const res = parseDsl('cat:sw -')
    expect(res.ok).toBe(false)
    expect(res.errores[0]!.message).toContain('sin operando')
  })

  it('rango en campo no numérico', () => {
    const res = parseDsl('fabricante:cisco..hpe')
    expect(res.ok).toBe(false)
    expect(res.errores[0]!.message).toContain('no admite rango')
  })

  it('rango inválido (hasta < desde)', () => {
    const res = parseDsl('velocidad:25..10')
    expect(res.ok).toBe(false)
    expect(res.errores[0]!.message).toContain('Rango inválido')
  })

  it('campo sin valor', () => {
    const res = parseDsl('cat:')
    expect(res.ok).toBe(false)
    expect(res.errores[0]!.message).toContain('sin valor')
  })

  it('recuperación: conserva los términos válidos junto a los errores', () => {
    const res = parseDsl('cat:sw protocol0:ospf')
    expect(res.ok).toBe(false)
    expect(res.errores.length).toBe(1)
  })
})