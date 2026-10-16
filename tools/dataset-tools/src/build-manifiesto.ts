import { versionDelArchivo } from '@netatlas/domain'
import type { DatasetManifest } from '@netatlas/domain'
import { ManifestRepository } from '@netatlas/data'

/**
 * Manifiesto del dataset (NET-HW-048, §19.4): conteos + SHA-256 y firma
 * Ed25519 opcional con `NETATLAS_SIGN_PRIVATE_KEY`; cierra el WAL dejando un
 * único archivo SQLite portable.
 *
 * La identidad del dataset es su contenido, no el momento del build. La fecha
 * de publicación se hereda del manifiesto que ya está en disco —reconstruir el
 * mismo dataset no lo convierte en otra publicación— o se fija a propósito con
 * `NETATLAS_SEED_PUBLISHED_ON`. Cuando no cambia nada, el fichero versionado se
 * queda intacto; cuando el dataset cambia de verdad, sube la revisión (`-rN`) y
 * su entrada se añade al changelog sin pisar las anteriores.
 */

const NOMBRE_DATASET = 'netatlas-seed'

/** Formato aceptado para la fecha de publicación impuesta por el entorno. */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Manifiesto aún sin firma (la firma se añade si hay clave privada). */
type ManifiestoBase = Omit<DatasetManifest, 'signature' | 'signatureValid'>

/** Conteos y metadatos que describen el dataset generado. */
export interface DatosManifiesto {
  readonly outPath: string
  /** Fecha de publicación (ISO) ya resuelta por `fechaDePublicacion`. */
  readonly publishedOn: string
  readonly schemaVersion: number
  readonly devices: number
  readonly relationshipCount: number
  readonly assertionCount: number
  readonly catalogCounts: { protocols: number; standards: number; media: number; manufacturers: number; categories: number }
  readonly topologiasCount: number
}

/** Ruta del manifiesto que acompaña al archivo del dataset. */
export function rutaManifiesto(outPath: string): string {
  return `${outPath}.manifest.json`
}

/**
 * Fecha de publicación del dataset: la que impone el entorno
 * (`NETATLAS_SEED_PUBLISHED_ON`, ISO 8601), la del manifiesto que ya existe en
 * el destino, o —si el dataset es nuevo— la de hoy. Reconstruir el seed no
 * reescribe la fecha: publicar una revisión nueva es una decisión, no un
 * efecto del build.
 */
export function fechaDePublicacion(outPath: string, hoy: string = hoyIso()): string {
  const impuesta = process.env.NETATLAS_SEED_PUBLISHED_ON?.trim()
  if (!impuesta) return new ManifestRepository().leer(rutaManifiesto(outPath))?.publishedOn ?? hoy
  return exigirFechaPublicacion(impuesta, 'NETATLAS_SEED_PUBLISHED_ON')
}

/** ¿`iso` es una fecha de calendario real en formato AAAA-MM-DD? */
function esFechaReal(iso: string): boolean {
  if (!FORMATO_FECHA.test(iso)) return false
  const fecha = new Date(`${iso}T00:00:00.000Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso
}

/**
 * Fecha de publicación válida o fallo explícito. La fecha entra en la versión
 * publicada (`…-<fecha>-rN`), así que se valida en el punto único que la
 * escribe: ni una cadena suelta ni un día inexistente (`2026-02-31`) pueden
 * colarse, vengan del entorno o de las opciones del build.
 */
export function exigirFechaPublicacion(valor: string, origen: string): string {
  if (!esFechaReal(valor)) {
    throw new Error(`${origen}="${valor}" no es una fecha ISO real (AAAA-MM-DD).`)
  }
  return valor
}

/**
 * Escribe el manifiesto del dataset. Devuelve `false` cuando no había nada que
 * cambiar: el fichero se conserva tal cual, con su fecha, su versión, su
 * changelog y su firma.
 */
export function escribirManifiesto(arg: DatosManifiesto): boolean {
  exigirFechaPublicacion(arg.publishedOn, 'publishedOn')
  const ruta = rutaManifiesto(arg.outPath)
  const repo = new ManifestRepository()
  const previo = repo.leer(ruta)
  const sha256 = ManifestRepository.hashArchivo(arg.outPath)
  const cambia = !mismoDataset(previo, arg, sha256)
  const clave = process.env.NETATLAS_SIGN_PRIVATE_KEY
  // Sin cambios no se toca el fichero: solo se reescribe si hay una firma nueva
  // que añadir (clave disponible y manifiesto previo sin firmar).
  if (!cambia && !(clave && !previo?.signature)) return false
  repo.escribir(ruta, firmarSiProcede(manifiestoBase(arg, previo, sha256, cambia), clave))
  return true
}

/** ¿El manifiesto previo describe ya este mismo dataset? */
function mismoDataset(previo: DatasetManifest | undefined, arg: DatosManifiesto, sha256: string): boolean {
  if (!previo || previo.sha256 !== sha256 || previo.schemaVersion !== arg.schemaVersion) return false
  const actuales = conteosDe(arg)
  const claves = Object.keys(actuales)
  if (claves.length !== Object.keys(previo.counts).length) return false
  // Cada conteo se lee y se comprueba: con `noUncheckedIndexedAccess` el acceso
  // por índice puede no existir, y un conteo ausente es «no es el mismo dataset».
  return claves.every((clave) => {
    const previoValor = previo.counts[clave]
    return previoValor !== undefined && previoValor === actuales[clave]
  })
}

/** Manifiesto sin firma: versión, conteos y SHA-256 del archivo generado. */
function manifiestoBase(
  arg: DatosManifiesto,
  previo: DatasetManifest | undefined,
  sha256: string,
  cambia: boolean,
): ManifiestoBase {
  const { version, changelog } = identidad(arg, previo, cambia)
  return {
    format: 'netatlas-dataset',
    name: NOMBRE_DATASET,
    version,
    schemaVersion: arg.schemaVersion,
    publishedOn: arg.publishedOn,
    counts: conteosDe(arg),
    sha256,
    changelog,
  }
}

/**
 * Versión y changelog. Sin cambios se conservan los del manifiesto previo; con
 * cambios, la revisión sube dentro de la misma publicación (o vuelve a 1 si la
 * fecha de publicación es nueva) y el changelog acumula la entrada.
 */
function identidad(
  arg: DatosManifiesto,
  previo: DatasetManifest | undefined,
  cambia: boolean,
): { version: string; changelog: readonly string[] } {
  // Primera publicación: no hay nada que heredar ni revisión que repetir.
  if (!previo) {
    return {
      version: versionDelArchivo(NOMBRE_DATASET, arg.publishedOn, 1),
      changelog: [`dataset:build regenerado (${arg.publishedOn})`],
    }
  }
  if (!cambia) return { version: previo.version, changelog: previo.changelog ?? [] }
  const revision = previo.publishedOn === arg.publishedOn ? revisionDe(previo) + 1 : 1
  return {
    version: versionDelArchivo(NOMBRE_DATASET, arg.publishedOn, revision),
    changelog: [...(previo.changelog ?? []), `dataset:build regenerado (${arg.publishedOn}, r${revision})`],
  }
}

/** Conteos del manifiesto, en el orden en que se publican. */
function conteosDe(arg: DatosManifiesto): Record<string, number> {
  return {
    dispositivos: arg.devices,
    relaciones: arg.relationshipCount,
    assertions: arg.assertionCount,
    protocolos: arg.catalogCounts.protocols,
    categorias: arg.catalogCounts.categories,
    topologias: arg.topologiasCount,
  }
}

/** Revisión declarada en una versión `…-rN` (1 si no la declara). */
function revisionDe(previo: DatasetManifest | undefined): number {
  const coincidencia = /-r(\d+)$/.exec(previo?.version ?? '')
  const revision = coincidencia?.[1]
  return revision ? Number(revision) : 1
}

/** Fecha de hoy en ISO 8601 (día). */
function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Firma Ed25519 del manifiesto si hay clave privada disponible. */
function firmarSiProcede(base: ManifiestoBase, clavePrivada: string | undefined): DatasetManifest {
  if (!clavePrivada) return base
  return { ...base, signature: ManifestRepository.firmar(base, clavePrivada), signatureValid: true }
}
