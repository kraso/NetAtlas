import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { leerConfig } from '../src/config.js'
import type { Hunk } from '../src/hunks.js'

/**
 * Forma del corpus de respuestas reales (`test/corpus.json`). Lo escriben
 * `corpus.ts` (recolector), lo leen `ajustar.ts` (barrido de umbrales) y
 * `test/corpus.test.ts` (la regresión), para que los tres hablen del mismo
 * fichero y no de tres copias.
 */
export interface MuestraCorpus {
  id: string
  proveedor: string
  fecha: string
  /** Violaciones puestas a propósito en el caso, para poder etiquetar. */
  esperadas: string
  archivos: ReadonlyArray<{ ruta: string; contenido: string }>
  alcance: ReadonlyArray<{ ruta: string; contenido: string; hunks: Hunk[] }>
  /** Las dos pasadas ciegas, en crudo. */
  respuestas: [string, string]
  /** Pares leídos a mano: ¿los dos hallazgos son el mismo? */
  etiquetas?: readonly Etiqueta[]
}

/** `a` y `b` son índices sobre los hallazgos de la primera y la segunda pasada. */
export interface Etiqueta {
  a: number
  b: number
  mismo: boolean
  nota: string
}

export interface Corpus {
  nota: string
  proveedorDelGate: string
  muestras: MuestraCorpus[]
}

export const RUTA_CORPUS = fileURLToPath(new URL('../test/corpus.json', import.meta.url))

/** Raíz del repositorio que contiene el tool: no depende del cwd. */
export const RAIZ_DEL_TOOL = fileURLToPath(new URL('../../../', import.meta.url))

export function leerCorpus(ruta: string = RUTA_CORPUS): Corpus {
  if (!existsSync(ruta)) {
    return { nota: '', proveedorDelGate: proveedorDelGate(), muestras: [] }
  }
  return JSON.parse(readFileSync(ruta, 'utf8')) as Corpus
}

function proveedorDelGate(): string {
  try {
    return leerConfig(RAIZ_DEL_TOOL, {}).proveedor
  } catch {
    return 'desconocido'
  }
}
