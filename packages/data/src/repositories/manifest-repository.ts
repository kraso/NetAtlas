import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { evaluarCompatibilidad } from '@netatlas/domain'
import type { AppDatasetBounds, DatasetCompat, DatasetManifest } from '@netatlas/domain'
import { DATASET_SCHEMA_VERSION } from '../index.js'

/**
 * Manifiesto del dataset (NET-HW-048, §19.4): el build genera `manifest.json`
 * junto al SQLite con conteos, hash SHA-256 del archivo y —si hay clave
 * privada de curador disponible— firma Ed25519. La app/CLI lo verifica para
 * detectar corrupción o esquemas incompatibles sin corrupción silenciosa.
 */

/** JSON canónico (claves ordenadas) para que la firma sea determinista. */
export function canonicalJson(value: unknown): string {
  const ordenado = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenado)
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordenado(x)]))
    }
    return v
  }
  return JSON.stringify(ordenado(value))
}

export class ManifestRepository {
  /** SHA-256 hexadecimal de un archivo (integridad del dataset). */
  static hashArchivo(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  }

  /** Firma Ed25519 del manifiesto (sin los campos de firma). */
  static firmar(manifest: Omit<DatasetManifest, 'signature' | 'signatureValid'>, clavePrivadaHex: string): string {
    const priv = createPrivateKey({ key: Buffer.from(clavePrivadaHex, 'hex'), format: 'der', type: 'pkcs8' })
    return sign(null, Buffer.from(canonicalJson(manifest), 'utf8'), priv).toString('hex')
  }

  /** Verifica la firma Ed25519 del manifiesto con una clave pública. */
  static verificar(manifest: DatasetManifest, clavePublicaHex: string): boolean {
    if (!manifest.signature) return false
    try {
      const pub = createPublicKey({ key: Buffer.from(clavePublicaHex, 'hex'), format: 'der', type: 'spki' })
      return verify(null, Buffer.from(canonicalJson({ ...manifest, signature: undefined, signatureValid: undefined }), 'utf8'), pub, Buffer.from(manifest.signature, 'hex'))
    } catch {
      return false
    }
  }

  static compat(manifest: DatasetManifest, bounds?: AppDatasetBounds): DatasetCompat {
    return evaluarCompatibilidad(manifest, bounds ?? { minSchemaVersion: 1, maxSchemaVersion: DATASET_SCHEMA_VERSION })
  }

  escribir(path: string, manifest: DatasetManifest): void {
    writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8')
  }

  leer(path: string): DatasetManifest | undefined {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as DatasetManifest
    } catch {
      return undefined
    }
  }
}