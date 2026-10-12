import React from 'react'
import { useFavoritosStore, useEsFavorito } from '../viewmodels/favorites-store.js'
import { useServices } from '../composition-root.js'

/** Último fallo de favoritos, visible en la ficha (`role="alert"`). */
function AvisoFavorito({ error }: { error: string | undefined }): React.JSX.Element | null {
  if (!error) return null
  return (
    <p role="alert" className="guia-tecnica" style={{ margin: '4px 0 0' }} data-testid="error-favorito">
      {error}
    </p>
  )
}

/** Botón de favoritos del usuario (F8B, NET-HW-064). */
export function BotonFavorito({ device }: { device: import('@netatlas/domain').Device }): React.JSX.Element {
  const esFavorito = useEsFavorito(device.slug.value)
  const alternarFavorito = useFavoritosStore((s) => s.alternar)
  const errorFavorito = useFavoritosStore((s) => s.error)
  return (
    <>
      <button
        type="button"
        className="btn-favorito"
        aria-pressed={esFavorito}
        data-testid={`favorito-${device.slug.value}`}
        onClick={() => alternarFavorito(device.slug.value)}
        title={esFavorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      >
        {esFavorito ? '★ En favoritos' : '☆ Favorito'}
      </button>
      <AvisoFavorito error={errorFavorito} />
    </>
  )
}

/**
 * Favoritos del usuario (F8B, NET-HW-064): local-first, sincronizable con
 * /v1/favorites. Se re-sincroniza al cambiar de ficha o de revisión del dataset.
 */
export function useSincronizarFavoritos(slug: string): void {
  const sincronizar = useFavoritosStore((s) => s.sincronizar)
  // La revisión entra en las deps como en el efecto original de la ficha: al
  // reemplazarse el dataset (demo → remoto, F8B) los favoritos se re-sincronizan.
  const revision = useServices((s) => s.revision)
  React.useEffect(() => {
    sincronizar()
  }, [slug, sincronizar, revision])
}
