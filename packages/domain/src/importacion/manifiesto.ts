/**
 * Manifiesto de dataset y actualización delta (§19.4, NET-HW-048).
 * Estructura del manifiesto (la firma Ed25519 y el hash los produce la
 * herramienta con node:crypto fuera del dominio puro) y evaluación de
 * compatibilidad con la app; diff de manifiestos para la actualización.
 */

export type DatasetCompat =
  | { readonly status: 'compatible' }
  | { readonly status: 'obsoleto'; readonly reason: string }
  | { readonly status: 'futuro'; readonly reason: string }
  | { readonly status: 'invalido'; readonly reason: string }

export interface DatasetManifest {
  readonly format: 'netatlas-dataset'
  readonly name: string
  /** Versión del dataset (p. ej. '2025-06-01-r3' o semver). */
  readonly version: string
  readonly schemaVersion: number
  readonly publishedOn: string
  readonly counts: Readonly<Record<string, number>>
  /** SHA-256 hexadecimal del archivo del dataset. */
  readonly sha256?: string | undefined
  /** Firma Ed25519 hexadecimal (clave privada del curador). */
  readonly signature?: string | undefined
  readonly signatureValid?: boolean | undefined
  readonly changelog?: readonly string[] | undefined
}

export interface AppDatasetBounds {
  readonly minSchemaVersion: number
  readonly maxSchemaVersion: number
  readonly format?: string | undefined
}

/**
 * §19.4: la app declara un rango de versiones de esquema; datasets fuera de
 * rango → aviso claro, nunca corrupción silenciosa.
 */
export function evaluarCompatibilidad(manifest: DatasetManifest, bounds: AppDatasetBounds): DatasetCompat {
  if (manifest.format !== 'netatlas-dataset') {
    return { status: 'invalido', reason: `Formato inesperado: "${manifest.format}".` }
  }
  if (manifest.schemaVersion < bounds.minSchemaVersion) {
    return { status: 'obsoleto', reason: `Esquema ${manifest.schemaVersion} < mínimo ${bounds.minSchemaVersion}.` }
  }
  if (manifest.schemaVersion > bounds.maxSchemaVersion) {
    return { status: 'futuro', reason: `Esquema ${manifest.schemaVersion} > máximo ${bounds.maxSchemaVersion} (la app debe actualizarse).` }
  }
  return { status: 'compatible' }
}

/** Diff entre dos manifiestos (qué cambió entre versiones). */
export function diffManifiestos(desde: DatasetManifest, hasta: DatasetManifest): { version: string; cambios: readonly string[] } {
  const cambios: string[] = []
  const claves = new Set([...Object.keys(desde.counts), ...Object.keys(hasta.counts)])
  for (const k of claves) {
    const a = desde.counts[k] ?? 0
    const b = hasta.counts[k] ?? 0
    if (a !== b) {
      cambios.push(`${k}: ${a} → ${b}${b > a ? ` (+${b - a})` : ` (${b - a})`}`)
    }
  }
  if (desde.schemaVersion !== hasta.schemaVersion) cambios.unshift(`esquema: v${desde.schemaVersion} → v${hasta.schemaVersion}`)
  if (hasta.changelog) cambios.push(...hasta.changelog)
  return { version: hasta.version, cambios }
}

/** Cambio unitario del delta (altas/actualizaciones/borrados). */
export type DeltaAccion = 'alta' | 'update' | 'delete'

export interface DeltaChange {
  readonly slug: string
  readonly accion: DeltaAccion
  readonly datos?: {
    readonly name?: string
    readonly manufacturerSlug?: string
    readonly categoryCode?: string
    readonly lifecycleStatus?: string
    readonly summary?: string
  }
}

/** Crea un número de versión de manifiesto razonable para un nombre de archivo. */
export function versionDelArchivo(datasetName: string, fecha: string, revision: number): string {
  return `${datasetName}-${fecha}-r${revision}`
}