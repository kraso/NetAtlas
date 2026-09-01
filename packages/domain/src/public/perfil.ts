/**
 * Perfiles y favoritos de usuario (F8B, NET-HW-064, §31.5). Dominio puro.
 *
 * El perfil identifica a un consumidor (humano o tercero vía API key) y sus
 * favoritos son referencias a entidades del catálogo: `device:slug`,
 * `protocol:code`, `standard:org/id`, … La UI PWA los persiste localmente
 * (localStorage) y la API los sincroniza (F8A outbox/replica ya provee el
 * transporte; aquí vive el contrato de datos).
 */

export const ROLES_PERFIL = ['curator', 'reviewer', 'reader'] as const
export type RolPerfil = (typeof ROLES_PERFIL)[number]

export function esRolPerfil(v: string): v is RolPerfil {
  return (ROLES_PERFIL as readonly string[]).includes(v)
}

export interface PerfilUsuario {
  readonly id: string
  /** Nombre visible (nick). */
  readonly nick: string
  readonly rol: RolPerfil
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Favorito {
  readonly perfilId: string
  /** Entidad referenciada: `device:cisco-c9300-48p`, `protocol:ospf`, … */
  readonly entidad: string
  readonly createdAt: string
}

export interface CrearPerfilInput {
  readonly id: string
  readonly nick: string
  readonly rol?: RolPerfil
  readonly createdAt?: string
}

/** Crea/valida un perfil (contrato de datos; el servidor persiste). */
export function crearPerfil(input: CrearPerfilInput): PerfilUsuario {
  const rol = input.rol ?? 'reader'
  if (!esRolPerfil(rol)) throw new Error(`Perfil: rol inválido "${rol}".`)
  if (input.id.trim().length === 0) throw new Error('Perfil: id no puede estar vacío.')
  if (input.nick.trim().length < 2) throw new Error('Perfil: nick debe tener ≥ 2 caracteres.')
  const now = input.createdAt ?? new Date().toISOString()
  return {
    id: input.id,
    nick: input.nick.trim(),
    rol,
    createdAt: now,
    updatedAt: now,
  }
}

const ENTIDAD_RE = /^(device|protocol|standard|medium|category|manufacturer|technology|topology):[A-Za-z0-9._/-]+$/

/** Valida el formato de una referencia a entidad: `tipo:slug`. */
export function esEntidadValida(entidad: string): boolean {
  return ENTIDAD_RE.test(entidad)
}

/** Límite de favoritos por perfil (evita abuso de la API). */
export const MAX_FAVORITOS = 200

/** Crea un favorito validado (entidad bien formada, sin duplicados por set). */
export function crearFavorito(perfilId: string, entidad: string, createdAt?: string): Favorito {
  if (!esEntidadValida(entidad)) {
    throw new Error(`Favorito: entidad mal formada "${entidad}" (se espera tipo:slug).`)
  }
  return { perfilId, entidad, createdAt: createdAt ?? new Date().toISOString() }
}

export interface PerfilRepository {
  obtener(id: string): Promise<PerfilUsuario | undefined>
  guardar(perfil: PerfilUsuario): Promise<void>
  favoritos(perfilId: string): Promise<readonly Favorito[]>
  agregarFavorito(favorito: Favorito): Promise<{ agregado: boolean; total: number }>
  quitarFavorito(perfilId: string, entidad: string): Promise<boolean>
}