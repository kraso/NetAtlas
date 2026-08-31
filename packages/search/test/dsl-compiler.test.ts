import { describe, expect, it } from 'vitest'
import { parseDsl } from '@netatlas/domain'
import { compileDsl } from '../src/index.js'

function compile(input: string) {
  const parsed = parseDsl(input)
  expect(parsed.ok, JSON.stringify(parsed.errores)).toBe(true)
  return compileDsl(parsed.ast!)
}

describe('compileDsl', () => {
  it('compila texto libre a cláusula FTS con prefijo', () => {
    const { where, params, hasMatch } = compileDsl(parseDsl('switch').ast!, { rawText: 'switch' })
    expect(hasMatch).toBe(true)
    expect(where).toContain('fts_device MATCH ?')
    expect(String(params[0])).toBe('"switch"*')
  })

  it('compila igualdad de categoría con doble parámetro (código + subárbol)', () => {
    const { where, params } = compile('cat:sw')
    expect(where).toContain('category')
    expect(where).toContain('?')
    expect(params).toHaveLength(2)
    expect(params[0]).toBe('sw')
  })

  it('compila rango de velocidad: Gbps → Mbps (>= desde)', () => {
    const { where, params } = compile('velocidad:10..25')
    expect(where).toContain('port')
    expect(where).toContain('json_each')
    expect(params[0]).toBe(10000) // 10 Gbps → Mbps
    expect(params[1]).toBe(25000)
  })

  it('negación genera NOT EXISTS', () => {
    const { where } = compile('-estado:discontinued')
    expect(where).toContain('NOT')
    expect(where).toContain('lifecycle_status')
  })

  it('protocolo requerido doble genera dos condiciones independientes (AND)', () => {
    const { where, params } = compile('+protocolo:bgp +protocolo:ospf')
    expect(where.match(/supports-protocol/g)).toHaveLength(2)
    expect(params).toContain('bgp')
    expect(params).toContain('ospf')
  })

  it('nunca inserta el valor del usuario sin parámetro (sin concatenación)', () => {
    const { where, params } = compile('fabricante:"cisco; DROP TABLE device"')
    const sql = where
    expect(sql).not.toContain('DROP TABLE')
    expect(sql).not.toContain('cisco;')
    expect(params.some((p) => String(p).includes('DROP'))).toBe(true) // el valor viaja como parámetro
  })

  it('consulta vacía → WHERE 1 (sin filtros)', () => {
    const { where, params } = compileDsl(parseDsl('').ast!, {})
    expect(where).toBe('1')
    expect(params).toHaveLength(0)
  })
})