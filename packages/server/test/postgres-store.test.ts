import { describe, expect, it } from 'vitest'
import type { ServidorStore, PgDriver } from '../src/index.js'
import { PostgresServidorStore, traducirParametros } from '../src/index.js'
import type { OutboxEntry } from '@netatlas/domain'

describe('Traducción de parámetros SQL → PostgreSQL', () => {
  it('convierte ? a $n en orden', () => {
    expect(traducirParametros('SELECT * FROM t WHERE a = ? AND b = ? OR c = ?')).toBe(
      'SELECT * FROM t WHERE a = $1 AND b = $2 OR c = $3',
    )
  })
})

describe('Adaptador PostgreSQL (NET-HW-062) — mismo contrato, driver doble', () => {
  /** Driver pg de prueba: registra SQL y responde filas vacías. */
  class PgFake implements PgDriver {
    sqls: string[] = []
    private rows = new Map<string, readonly Record<string, string | number | null>[]>()

    async query<T extends Record<string, string | number | null>>(
      sql: string,
      params: readonly (string | number | null)[] = [],
    ): Promise<readonly T[]> {
      this.sqls.push(sql)
      if (sql.includes('MAX(revision)')) {
        return [{ v: 0 }] as unknown as readonly T[]
      }
      const key = `${sql}|${params.join(',')}`
      return (this.rows.get(key) ?? []) as readonly T[]
    }

    async close(): Promise<void> {}
  }

  it('genera SQL PostgreSQL ($1, schema) y acepta contribuciones', async () => {
    const fake = new PgFake()
    const store = new PostgresServidorStore(fake, 'netatlas2')
    const entrada: OutboxEntry = {
      id: 'pg-1', tipo: 'nota', entidad: 'device:x', autor: 'u', payload: { nota: 'hola' },
      createdAt: '2025-03-01', revision: 4, status: 'pendiente',
    }
    const aceptadas = await store.recibirContribuciones([entrada])
    expect(aceptadas).toEqual(['pg-1'])
    const insert = fake.sqls.find((s) => s.includes('INSERT INTO'))
    expect(insert).toBeDefined()
    expect(insert).toContain('$1')
    expect(insert).toContain('netatlas2.netatlas_contribuciones')
    expect(insert).toContain('ON CONFLICT(id) DO UPDATE')
  })

  it('el adaptador cumple el contrato ServidorStore (tipo+forma)', async () => {
    const store: ServidorStore = new PostgresServidorStore(new PgFake())
    expect(typeof store.describe).toBe('function')
    expect(typeof store.snapshot).toBe('function')
    expect(typeof store.recibirContribuciones).toBe('function')
    expect(typeof store.version).toBe('function')
  })
})
