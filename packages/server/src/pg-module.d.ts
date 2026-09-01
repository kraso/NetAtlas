/**
 * Declaración mínima de `pg` (node-postgres) — dependencia OPCIONAL del
 * adaptador PostgreSQL (NET-HW-062): solo se requiere al desplegar con
 * NETATLAS_PG. Con SQLite por defecto no se instala ni se importa.
 */
declare module 'pg' {
  export interface ClientConfig {
    connectionString?: string
    host?: string
    port?: number
    database?: string
    user?: string
    password?: string
  }

  export interface QueryResult<T = Record<string, unknown>> {
    rows: readonly T[]
  }

  export class Client {
    constructor(config?: ClientConfig)
    connect(): Promise<void>
    query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>
    end(): Promise<void>
  }
}