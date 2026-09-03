/**
 * Caso de uso: Gestión de favoritos (F8B, NET-HW-064).
 *
 * Orquesta el puerto `FavoritesPort` para alternar favoritos y devolver el
 * estado resultante. La validación de formato `tipo:slug` se delega al dominio
 * (`esEntidadValida` de `@netatlas/domain/public`).
 */
import { esEntidadValida } from '@netatlas/domain'
import type { Favorito } from '@netatlas/domain'
import type { FavoritesPort } from '../index.js'

export type FavoritesAction = 'add' | 'remove'

export interface ManageFavoritesInput {
  readonly entidad: string
  readonly action: FavoritesAction
}

export interface ManageFavoritesResult {
  /** Estado actualizado tras la acción. */
  readonly favoritos: readonly Favorito[]
  /** true si la entidad ahora está en favoritos. */
  readonly added: boolean
}

/**
 * Alterna un favorito: si está → lo quita; si no → lo agrega.
 * Valida el formato de entidad (tipo:slug) antes de operar.
 */
export async function manageFavorites(
  ports: { favorites: FavoritesPort },
  input: ManageFavoritesInput,
): Promise<ManageFavoritesResult> {
  if (!esEntidadValida(input.entidad)) {
    throw new Error(`Favorito: entidad mal formada "${input.entidad}" (se espera tipo:slug).`)
  }

  const actuales = await ports.favorites.list()
  const existe = actuales.some((f) => f.entidad === input.entidad)

  if (existe) {
    await ports.favorites.remove(input.entidad)
    return { favoritos: actuales.filter((f) => f.entidad !== input.entidad), added: false }
  }

  await ports.favorites.add(input.entidad)
  const nuevo = [...actuales, { perfilId: 'local', entidad: input.entidad, createdAt: new Date().toISOString() } as Favorito]
  return { favoritos: nuevo, added: true }
}
