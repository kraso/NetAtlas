import { versionDelArchivo } from '@netatlas/domain'
import type { DatasetManifest } from '@netatlas/domain'
import { ManifestRepository } from '@netatlas/data'

/**
 * Manifiesto del dataset (NET-HW-048, §19.4): conteos + SHA-256 y firma
 * Ed25519 opcional con `NETATLAS_SIGN_PRIVATE_KEY`; cierra el WAL dejando un
 * único archivo SQLite portable.
 */

/** Manifiesto aún sin firma (la firma se añade si hay clave privada). */
type ManifiestoBase = Omit<DatasetManifest, 'signature' | 'signatureValid'>

/** Conteos y metadatos que describen el dataset generado. */
export interface DatosManifiesto {
  readonly outPath: string
  readonly schemaVersion: number
  readonly devices: number
  readonly relationshipCount: number
  readonly assertionCount: number
  readonly catalogCounts: { protocols: number; standards: number; media: number; manufacturers: number; categories: number }
  readonly topologiasCount: number
}

export function escribirManifiesto(arg: DatosManifiesto): void {
  const base = manifiestoBase(arg)
  new ManifestRepository().escribir(`${arg.outPath}.manifest.json`, firmarSiProcede(base))
}

/** Manifiesto sin firma: versión, conteos y SHA-256 del archivo generado. */
function manifiestoBase(arg: DatosManifiesto): ManifiestoBase {
  const publishedOn = new Date().toISOString().slice(0, 10)
  return {
    format: 'netatlas-dataset',
    name: 'netatlas-seed',
    version: versionDelArchivo('netatlas-seed', publishedOn, 1),
    schemaVersion: arg.schemaVersion,
    publishedOn,
    counts: {
      dispositivos: arg.devices,
      relaciones: arg.relationshipCount,
      assertions: arg.assertionCount,
      protocolos: arg.catalogCounts.protocols,
      categorias: arg.catalogCounts.categories,
      topologias: arg.topologiasCount,
    },
    sha256: ManifestRepository.hashArchivo(arg.outPath),
    changelog: [`dataset:build regenerado (${publishedOn})`],
  }
}

/** Firma Ed25519 del manifiesto si el entorno aporta la clave privada. */
function firmarSiProcede(base: ManifiestoBase): DatasetManifest {
  const clavePrivada = process.env.NETATLAS_SIGN_PRIVATE_KEY
  if (!clavePrivada) return base
  return { ...base, signature: ManifestRepository.firmar(base, clavePrivada), signatureValid: true }
}
