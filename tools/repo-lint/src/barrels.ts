/**
 * Regla del barrel de la aplicación: ningún módulo de la app importa
 * `@netatlas/application` con un import que sobreviva al compilado.
 *
 * El barrel reexporta el caso de importación por lote, que arrastra
 * `@netatlas/importers` → `@netatlas/data`; ese paquete es `external` en el build
 * del navegador, el chunk de entrada queda con `import"@netatlas/data"` y la app
 * arranca en blanco (los E2E mueren por timeout hasta agotar el job). `tsc` no lo
 * ve —el specifier resuelve y compila— y `dist:lint` sí, pero solo después de
 * compilar: esta regla caza la causa en estático, sin build.
 *
 * Los imports de tipo no cuentan: con `verbatimModuleSyntax` el compilado los
 * borra enteros, así que no pueden arrastrar runtime. El build de la app lo
 * demuestra: tres módulos importan tipos del barrel y en `dist` no queda ni un
 * `@netatlas/application`. Lo que se reporta es cualquier forma que emita código
 * —por defecto, `* as ns`, `export * from`, `{ … }` con algún nombre sin `type`,
 * `import {}` y el `import(…)` dinámico en posición de valor—, así que la regla
 * no tiene falsos positivos hoy y sigue cazando el fallo real.
 *
 * El análisis de qué sentencia sobrevive vive en `sentencias-valor.ts`, que es
 * quien habla con el compilador: aquí solo se filtra por el barrel.
 */
import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { DIR_APP, listarFuentes } from './modulos.js'
import { sentenciasDeValor } from './sentencias-valor.js'

/** Barrel que la app no puede importar en runtime: arrastra código de Node. */
export const BARREL_APLICACION = '@netatlas/application'

export interface ImportDeValor {
  /** Línea 1-based donde empieza la sentencia. */
  readonly linea: number
  /** La sentencia ofensora, en una línea y recortada. */
  readonly sentencia: string
}

export interface ViolacionBarrel extends ImportDeValor {
  readonly ruta: string
}

export interface InformeBarrels {
  /** Módulos de la app revisados. */
  readonly revisados: number
  readonly violaciones: readonly ViolacionBarrel[]
}

/** Sentencias de un módulo que importan el barrel y dejan código en el bundle. */
export function importsDeValor(contenido: string, ruta: string): readonly ImportDeValor[] {
  return sentenciasDeValor(contenido, ruta)
    .filter((sentencia) => sentencia.specifier === BARREL_APLICACION)
    .map(({ linea, sentencia }) => ({ linea, sentencia }))
}

/** Revisa los módulos de la app y devuelve los que importan el barrel en runtime. */
export function revisarBarrels(raizRepo: string): InformeBarrels {
  const modulos = listarFuentes(join(raizRepo, DIR_APP))
  const violaciones: ViolacionBarrel[] = []
  for (const ruta of modulos) {
    const rutaRel = relative(raizRepo, ruta).split(sep).join('/')
    for (const encontrado of importsDeValor(readFileSync(ruta, 'utf8'), rutaRel)) {
      violaciones.push({ ruta: rutaRel, ...encontrado })
    }
  }
  violaciones.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.linea - b.linea)
  return { revisados: modulos.length, violaciones }
}
