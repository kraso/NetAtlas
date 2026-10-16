import type { Hunk } from './hunks.js'
import { contarLineasCambiadas, unirHunks } from './hunks.js'

/**
 * Alcance de un fichero: la cabecera y las líneas cambiadas, numeradas como en
 * el fichero real, más las métricas que el revisor no puede deducir de un
 * fragmento (total de líneas, declaraciones de import). Los huecos se marcan a
 * propósito: sin esa marca el revisor creería que ve el fichero completo.
 *
 * Las regiones se emiten en orden de línea, así que el revisor lee el fichero de
 * arriba abajo y los números no van y vienen.
 */
export interface AlcanceFichero {
  ruta: string
  texto: string
  /** Contenido completo del fichero: lo necesitan las reglas mecánicas del gate. */
  contenido: string
  lineasTotales: number
  lineasCambiadas: number
  imports: number
  hunks: Hunk[]
}

export interface FicheroCambiado {
  ruta: string
  contenido: string
  hunks: readonly Hunk[]
}

/** Líneas de cabecera que acompañan al cambio: imports y tipos de los que sale el código nuevo. */
export const CABECERA_LINEAS = 40

interface Region {
  desde: number
  hasta: number
  cabecera: boolean
  cambio: boolean
  borradas: number
}

export function construirAlcance(fichero: FicheroCambiado): AlcanceFichero {
  const lineas = fichero.contenido.split('\n')
  const hunks = unirHunks(fichero.hunks)
  const imports = contarDeclaracionesImport(lineas)
  const texto = [
    `--- FILE: ${fichero.ruta} ---`,
    `[métricas: total=${lineas.length} líneas; imports=${imports} declaraciones; cambiadas=${contarLineasCambiadas(hunks)} líneas]`,
    '[alcance: cabecera del fichero y solo las líneas cambiadas; los huecos van marcados]',
    ...bloques(lineas, hunks),
    `--- FIN: ${fichero.ruta} ---`,
  ].join('\n')
  return {
    ruta: fichero.ruta,
    texto,
    contenido: fichero.contenido,
    lineasTotales: lineas.length,
    lineasCambiadas: contarLineasCambiadas(hunks),
    imports,
    hunks,
  }
}

function bloques(lineas: readonly string[], hunks: readonly Hunk[]): string[] {
  const trozos: string[] = []
  let ultima = 0
  for (const region of unirRegiones(regionesDeInteres(lineas.length, hunks))) {
    trozos.push(...marcaDeHueco(ultima, region.desde - 1))
    if (region.hasta < region.desde) {
      trozos.push(`[cambio: tras la línea ${region.desde - 1} se eliminan ${region.borradas} líneas]`)
      continue
    }
    trozos.push(etiquetaDeRegion(region), ...render(lineas, region.desde, region.hasta))
    ultima = region.hasta
  }
  return trozos
}

function regionesDeInteres(lineas: number, hunks: readonly Hunk[]): Region[] {
  const regiones: Region[] = hunks.map((hunk) => ({
    desde: hunk.desde,
    hasta: hunk.hasta,
    cabecera: false,
    cambio: true,
    borradas: hunk.borradas,
  }))
  if (lineas >= 1) {
    regiones.push({ desde: 1, hasta: Math.min(CABECERA_LINEAS, lineas), cabecera: true, cambio: false, borradas: 0 })
  }
  return regiones
}

/** Une las regiones que se solapan; las que solo se tocan quedan aparte para no perder la etiqueta. */
function unirRegiones(regiones: readonly Region[]): Region[] {
  const ordenadas = [...regiones].sort((una, otra) => una.desde - otra.desde)
  const unidas: Region[] = []
  for (const region of ordenadas) {
    const anterior = unidas[unidas.length - 1]
    const solapan =
      anterior !== undefined &&
      anterior.hasta >= anterior.desde &&
      region.hasta >= region.desde &&
      anterior.hasta >= region.desde
    if (anterior !== undefined && solapan) {
      unidas[unidas.length - 1] = {
        desde: anterior.desde,
        hasta: Math.max(anterior.hasta, region.hasta),
        cabecera: anterior.cabecera || region.cabecera,
        cambio: anterior.cambio || region.cambio,
        borradas: 0,
      }
      continue
    }
    unidas.push({ ...region })
  }
  return unidas
}

function etiquetaDeRegion(region: Region): string {
  const clases = [region.cabecera ? 'cabecera' : '', region.cambio ? 'cambio' : ''].filter((clase) => clase !== '')
  return `[${clases.join(' y ')}: líneas ${region.desde}-${region.hasta}]`
}

function render(lineas: readonly string[], desde: number, hasta: number): string[] {
  const salida: string[] = []
  for (let linea = desde; linea <= hasta; linea += 1) {
    salida.push(`${String(linea).padStart(5, ' ')} | ${lineas[linea - 1] ?? ''}`)
  }
  return salida
}

/** Marca explícita de las líneas que quedaron fuera del alcance; `hasta` es la última omitida. */
function marcaDeHueco(ultima: number, hasta: number): string[] {
  const primera = ultima + 1
  if (hasta < primera) {
    return []
  }
  return [`… (líneas ${primera}-${hasta} sin cambios, omitidas) …`]
}

/** Declaración `import` o `export … from`: una sola definición de lo que cuenta la regla. */
export function esDeclaracionImport(linea: string): boolean {
  return /^\s*(import\b|export\s+[^;]*\bfrom\b)/.test(linea)
}

/** Declaraciones `import` y `export … from`, que es lo que cuenta la regla de AGENTS.md. */
export function contarDeclaracionesImport(lineas: readonly string[]): number {
  return lineas.filter(esDeclaracionImport).length
}
