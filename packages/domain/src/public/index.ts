/**
 * Dominio público (F8B): perfiles y favoritos de usuario.
 * Las claves de API viven en @netatlas/server (usan node:crypto; el dominio
 * es agnóstico de plataforma para que la PWA pueda importarlo sin `node:`).
 */
export {
  ROLES_PERFIL,
  esRolPerfil,
  crearPerfil,
  esEntidadValida,
  MAX_FAVORITOS,
  crearFavorito,
} from './perfil.js'
export type { RolPerfil, PerfilUsuario, Favorito, CrearPerfilInput, PerfilRepository } from './perfil.js'