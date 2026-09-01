/**
 * Almacén del API público (F8B, NET-HW-065/064).
 *
 * Datos de consumidores/usuarios: claves de API (solo hash), perfiles,
 * favoritos y auditoría. Son runtime-only (USB del usuario/tercero), FUERA del
 * manifiesto firmado del dataset (§22.4) — tablas idempotentes al primer uso.
 */
import type { SqliteDriver } from '@netatlas/data'
import { hashClaveApi } from './api-keys.js'
import type { PerfilRepository, PerfilUsuario, Favorito } from '@netatlas/domain'

const SQL_PUBLIC = `
  CREATE TABLE IF NOT EXISTS netatlas_api_keys (
    id TEXT PRIMARY KEY,
    prefijo TEXT NOT NULL,
    hash TEXT NOT NULL,
    creada TEXT NOT NULL,
    activa INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS netatlas_profiles (
    id TEXT PRIMARY KEY,
    nick TEXT NOT NULL,
    rol TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS netatlas_favorites (
    perfil_id TEXT NOT NULL REFERENCES netatlas_profiles(id),
    entidad TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (perfil_id, entidad)
  );
  CREATE TABLE IF NOT EXISTS netatlas_api_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave_prefijo TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`

export interface ApiKeyRow {
  readonly id: string
  readonly prefijo: string
  readonly hash: string
  readonly creada: string
  readonly activa: number
}

export class SqlitePublicStore implements PerfilRepository {
  constructor(private readonly db: SqliteDriver) {
    db.exec(SQL_PUBLIC)
  }

  // ── Claves de API ─────────────────────────────────────────────────────────

  /** Registra una clave (solo hash + prefijo público). Devuelve el id. */
  async registrarClave(id: string, claveEnClaro: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO netatlas_api_keys (id, prefijo, hash, creada, activa)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, prefijo = excluded.prefijo`,
      )
      .run(id, prefijoDeClave(claveEnClaro), hashClaveApi(claveEnClaro), new Date().toISOString())
  }

  /** ¿Existe una clave activa con este hash? (para verificar Authorization). */
  async claveActivaPorHash(hash: string): Promise<ApiKeyRow | undefined> {
    const row = this.db.prepare('SELECT * FROM netatlas_api_keys WHERE hash = ? AND activa = 1').get(hash) as
      | ApiKeyRow
      | undefined
    return row
  }

  /** Lista de claves (solo prefijos, nunca hashes/secreto) para gestión. */
  async listarClaves(): Promise<readonly { id: string; prefijo: string; creada: string; activa: boolean }[]> {
    const rows = this.db.prepare('SELECT * FROM netatlas_api_keys ORDER BY creada').all() as unknown as ApiKeyRow[]
    return rows.map((r) => ({ id: r.id, prefijo: r.prefijo, creada: r.creada, activa: r.activa === 1 }))
  }

  async desactivarClave(id: string): Promise<void> {
    this.db.prepare('UPDATE netatlas_api_keys SET activa = 0 WHERE id = ?').run(id)
  }

  // ── Perfil ────────────────────────────────────────────────────────────────

  async obtener(id: string): Promise<PerfilUsuario | undefined> {
    const row = this.db.prepare('SELECT * FROM netatlas_profiles WHERE id = ?').get(id) as
      | { id: string; nick: string; rol: string; created_at: string; updated_at: string }
      | undefined
    if (!row) return undefined
    return { id: row.id, nick: row.nick, rol: row.rol as PerfilUsuario['rol'], createdAt: row.created_at, updatedAt: row.updated_at }
  }

  async guardar(perfil: PerfilUsuario): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO netatlas_profiles (id, nick, rol, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nick = excluded.nick, rol = excluded.rol, updated_at = excluded.updated_at`,
      )
      .run(perfil.id, perfil.nick, perfil.rol, perfil.createdAt, perfil.updatedAt)
  }

  // ── Favoritos ─────────────────────────────────────────────────────────────

  async favoritos(perfilId: string): Promise<readonly Favorito[]> {
    const rows = this.db
      .prepare('SELECT perfil_id AS perfilId, entidad, created_at AS createdAt FROM netatlas_favorites WHERE perfil_id = ? ORDER BY created_at')
      .all(perfilId) as unknown as Favorito[]
    return rows
  }

  async agregarFavorito(favorito: Favorito): Promise<{ agregado: boolean; total: number }> {
    const res = this.db
      .prepare(
        `INSERT INTO netatlas_favorites (perfil_id, entidad, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(perfil_id, entidad) DO NOTHING`,
      )
      .run(favorito.perfilId, favorito.entidad, favorito.createdAt)
    const total = Number((this.db.prepare('SELECT COUNT(*) AS c FROM netatlas_favorites WHERE perfil_id = ?').get(favorito.perfilId) as { c: number }).c)
    return { agregado: res.changes > 0, total }
  }

  async quitarFavorito(perfilId: string, entidad: string): Promise<boolean> {
    const res = this.db.prepare('DELETE FROM netatlas_favorites WHERE perfil_id = ? AND entidad = ?').run(perfilId, entidad)
    return res.changes > 0
  }

  // ── Auditoría ─────────────────────────────────────────────────────────────

  async auditar(clavePrefijo: string, endpoint: string, status: number): Promise<void> {
    this.db
      .prepare('INSERT INTO netatlas_api_audit (clave_prefijo, endpoint, status, created_at) VALUES (?, ?, ?, ?)')
      .run(clavePrefijo, endpoint, status, new Date().toISOString())
  }

  async conteoAuditoria(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM netatlas_api_audit').get()
    return Number(row?.c ?? 0)
  }
}

function prefijoDeClave(clave: string): string {
  return clave.length > 12 ? clave.slice(0, 8) : clave
}