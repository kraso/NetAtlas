/**
 * Bases SQLite de prueba del servidor: una copia temporal del seed (para los
 * tests que mutan la BD) o una base en memoria, siempre con las migraciones
 * aplicadas y con el store y la API pública ya montados.
 */
import { copyFileSync, rmSync } from 'node:fs'
import { NodeSqliteDriver, applyMigrations, loadMigrations } from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { SqliteServidorStore, SqliteExecutor, SqlitePublicStore } from '../src/index.js'
import { migracionesDir, rutaSeedTemporal, seedPath } from './rutas-prueba.js'

export interface SqlitePrueba {
  readonly db: NodeSqliteDriver
  readonly store: SqliteServidorStore
  readonly publicStore: SqlitePublicStore
  /** Cierra la BD y borra la copia temporal del seed. */
  cerrar(): void
}

export interface OpcionesSqlitePrueba {
  /** El store necesita la ruta real para servir el dataset firmado (§31.3). */
  readonly conRutaDbEnStore?: boolean
}

/** BD en memoria con las migraciones aplicadas (tests sin ficheros). */
export function crearDriverMemoria(): NodeSqliteDriver {
  const db = new NodeSqliteDriver(':memory:')
  applyMigrations(db, loadMigrations(migracionesDir))
  return db
}

/** Store de servidor sobre una BD en memoria (merge LWW, rate limit, …). */
export function crearStoreMemoria(): { db: NodeSqliteDriver; store: SqliteServidorStore } {
  const db = crearDriverMemoria()
  return { db, store: new SqliteServidorStore(db, new SqliteExecutor(db), new Fts5SearchIndex(db)) }
}

/** Copia temporal del seed lista para levantar el servidor de pruebas. */
export function crearSqlitePrueba(prefijo: string, opciones: OpcionesSqlitePrueba = {}): SqlitePrueba {
  const ruta = rutaSeedTemporal(prefijo)
  copyFileSync(seedPath, ruta)
  const db = new NodeSqliteDriver(ruta)
  applyMigrations(db, loadMigrations(migracionesDir))
  const store = new SqliteServidorStore(
    db,
    new SqliteExecutor(db),
    new Fts5SearchIndex(db),
    opciones.conRutaDbEnStore ? ruta : undefined,
  )
  return {
    db,
    store,
    publicStore: new SqlitePublicStore(db),
    cerrar: () => {
      db.close()
      rmSync(ruta, { force: true })
    },
  }
}
