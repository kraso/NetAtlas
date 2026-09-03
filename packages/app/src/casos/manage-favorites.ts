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

export type FavoritesAction = 'toggle' | 'add' | 'remove'

export interface ManageFavoritesInput {
  readonly entidad: string
  readonly action: FavoritesAction
}

export interface ManageFavoritesResult {
  readonly favoritos: readonly Favorito[]
  /** true si la entidad ahora está en favoritos. */
  readonly added: boolean
}

function makeFavorito(entidad: string): Favorito {
  return { perfilId: 'local', entidad, createdAt: new Date().toISOString() }
}

export async function manageFavorites(
  ports: { favorites: FavoritesPort },
  input: ManageFavoritesInput,
): Promise<ManageFavoritesResult> {
  if (!esEntidadValida(input.entidad)) {
    throw new Error(`Favorito: entidad mal formada "${input.entidad}" (se espera tipo:slug).`)
  }

  const actuales = await ports.favorites.list()
  const existe = actuales.some((f) => f.entidad === input.entidad)

  if (input.action === 'remove' || (input.action === 'toggle' && existe)) {
    await ports.favorites.remove(input.entidad)
    return { favoritos: actuales.filter((f) => f.entidad !== input.entidad), added: false }
  }

  // add o toggle (no existe)
  await ports.favorites.add(input.entidad)
  const nuevo = [...actuales, makeFavorito(input.entidad)]
  return { favoritos: nuevo, added: true }
}
