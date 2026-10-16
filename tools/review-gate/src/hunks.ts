/**
 * Rangos de líneas cambiadas por fichero, en la versión nueva del fichero. Es
 * la materia prima del alcance: el gate manda al revisor solo estas líneas (más
 * la cabecera del fichero) en vez del fichero entero, que es lo que producía
 * hallazgos sobre código que nadie tocó.
 */
export interface Hunk {
  /** Primera línea nueva del hunk; con `hasta < desde` el hunk solo borra. */
  desde: number
  hasta: number
  /** Líneas eliminadas, para poder decir cuántas desaparecieron sin mostrarlas. */
  borradas: number
}

export type HunksPorFichero = Map<string, Hunk[]>

/** Huecos de hasta esta cantidad de líneas se absorben al unir hunks vecinos. */
export const HUECO_DE_UNION = 3

export function leerHunks(diff: string): HunksPorFichero {
  const porFichero: HunksPorFichero = new Map()
  let rutaActual: string | null = null
  for (const linea of diff.split('\n')) {
    const fichero = /^\+\+\+ (.+)$/.exec(linea)
    if (fichero?.[1] !== undefined) {
      const ruta = normalizarRuta(fichero[1])
      rutaActual = ruta === '/dev/null' ? null : ruta
      continue
    }
    const cabecera = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(linea)
    if (cabecera?.[2] === undefined || rutaActual === null) {
      continue
    }
    const hunk = aHunk(cabecera[1], cabecera[2], cabecera[3])
    const hunks = porFichero.get(rutaActual)
    if (hunks === undefined) {
      porFichero.set(rutaActual, [hunk])
    } else {
      hunks.push(hunk)
    }
  }
  return porFichero
}

function aHunk(borradas: string | undefined, desde: string, nuevas: string | undefined): Hunk {
  const inicio = Number.parseInt(desde, 10)
  const cantidad = nuevas === undefined ? 1 : Number.parseInt(nuevas, 10)
  const eliminadas = borradas === undefined ? 1 : Number.parseInt(borradas, 10)
  if (cantidad === 0) {
    // Borrado puro: `+inicio,0` apunta a la línea tras la que se eliminó.
    return { desde: inicio + 1, hasta: inicio, borradas: eliminadas }
  }
  return { desde: inicio, hasta: inicio + cantidad - 1, borradas: eliminadas }
}

/** Une hunks que casi se tocan: dos bloques separados por una línea suelta no aportan nada. */
export function unirHunks(hunks: readonly Hunk[], hueco: number = HUECO_DE_UNION): Hunk[] {
  const ordenados = [...hunks].sort((a, b) => a.desde - b.desde)
  const unidos: Hunk[] = []
  for (const hunk of ordenados) {
    const anterior = unidos[unidos.length - 1]
    if (anterior !== undefined && hunk.desde - anterior.hasta <= hueco + 1) {
      unidos[unidos.length - 1] = {
        desde: anterior.desde,
        hasta: Math.max(anterior.hasta, hunk.hasta),
        borradas: anterior.borradas + hunk.borradas,
      }
      continue
    }
    unidos.push({ ...hunk })
  }
  return unidos
}

/** Cuenta las líneas nuevas que aporta el cambio (los hunks que solo borran no aportan). */
export function contarLineasCambiadas(hunks: readonly Hunk[]): number {
  return hunks.reduce((total, hunk) => total + Math.max(0, hunk.hasta - hunk.desde + 1), 0)
}

export function cubreLinea(hunks: readonly Hunk[], linea: number): boolean {
  return hunks.some((hunk) => linea >= hunk.desde && linea <= hunk.hasta)
}

function normalizarRuta(ruta: string): string {
  const limpia = ruta.trim().replace(/^"|"$/g, '')
  const sinPrefijo = limpia.startsWith('b/') ? limpia.slice(2) : limpia
  return sinPrefijo.replace(/\\/g, '/')
}

/**
 * Desvío de líneas tolerado al cruzar dos pasadas (y al decidir si un hallazgo
 * señala el cambio). El corpus de respuestas reales lo acota por arriba: el par
 * «distinto» más parecido —dos `catch` distintos a 5 líneas, con la misma regla y
 * la misma redacción— solo lo separa la línea, así que 5 une lo que hay que
 * separar y falla `test/corpus.test.ts`. El valor concreto lo justifica ese test.
 */
export const TOLERANCIA_LINEAS = 3

/** ¿El hallazgo señala una línea del cambio (con la misma tolerancia del cruce)? */
export function señalaElCambio(
  hunks: readonly Hunk[],
  linea: number | null,
  tolerancia: number = TOLERANCIA_LINEAS,
): boolean {
  if (linea === null) {
    return false
  }
  return hunks.some((hunk) => linea >= hunk.desde - tolerancia && linea <= hunk.hasta + tolerancia)
}
