/**
 * Semántica de patrones de GGA (v2.10.1), de la que depende el `.gga`
 * versionado: un patrón que empieza por `*` se compara como **sufijo literal**
 * sobre la ruta completa (no como «contiene»), y el resto como glob contra la
 * ruta completa o contra el nombre del fichero, donde `*` sí cruza directorios.
 * Por eso los directorios se cubren con `?*fixtures/*` y no con `*fixtures*`.
 *
 * El gate reimplementa esa lectura en vez de delegar en GGA porque el alcance
 * (qué ficheros y qué líneas entran) lo decide el wrapper; si divergieran, el
 * hook y el job de CI revisarían ficheros distintos.
 */

const cacheGlobs = new Map<string, RegExp>()

export function coincidePatron(ruta: string, patron: string): boolean {
  const limpio = patron.trim()
  if (limpio === '') {
    return false
  }
  if (limpio === '*') {
    return true
  }
  if (limpio.startsWith('*')) {
    return ruta.endsWith(limpio.slice(1))
  }
  const barra = ruta.lastIndexOf('/')
  const nombre = barra === -1 ? ruta : ruta.slice(barra + 1)
  const re = globARegex(limpio)
  return re.test(ruta) || re.test(nombre)
}

export function coincideAlgunPatron(ruta: string, patrones: readonly string[]): boolean {
  return patrones.some((patron) => coincidePatron(ruta, patron))
}

function globARegex(patron: string): RegExp {
  const cacheado = cacheGlobs.get(patron)
  if (cacheado) {
    return cacheado
  }
  const cuerpo = patron
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  const re = new RegExp(`^${cuerpo}$`)
  cacheGlobs.set(patron, re)
  return re
}

/** Lista de patrones tal como la escribe el `.gga` (separada por comas). */
export function partirPatrones(valor: string): string[] {
  return valor
    .split(',')
    .map((patron) => patron.trim())
    .filter((patron) => patron !== '')
}

/** Ficheros del cambio que entran al gate: casan una inclusión y ninguna exclusión. */
export function filtrarFicheros(cambios: readonly string[], incluir: string, excluir: string): string[] {
  const patronesIncluir = partirPatrones(incluir)
  const patronesExcluir = partirPatrones(excluir)
  return cambios.filter(
    (ruta) =>
      coincideAlgunPatron(ruta, patronesIncluir) && !coincideAlgunPatron(ruta, patronesExcluir),
  )
}
