import type { AlcanceFichero } from './alcance.js'
import type { Hallazgo, Revision } from './hallazgos.js'
import { TOLERANCIA_LINEAS, señalaElCambio } from './hunks.js'
import { reglasCompatibles } from './similitud.js'

// La medida de similitud vive en `similitud.ts`; se reexporta para que el cruce y
// su medida se importen del mismo sitio.
export { similitudDe } from './similitud.js'

/**
 * Regla de reproducibilidad del gate: bloquean solo los hallazgos que aparecen
 * en las dos pasadas ciegas. No hay estado que recordar, así que la regla vale
 * igual en local (donde la caché solo guardaba aprobados) y en CI (donde no hay
 * caché ninguna): el veredicto queda en función del contenido, no de la muestra.
 *
 * Además, un hallazgo solo bloquea si señala una línea del cambio: la deuda
 * preexistente no puede bloquear para siempre un fichero que ya estaba así.
 */

/**
 * Cuánta similitud y cuánto desvío de líneas se tolera al cruzar las dos pasadas.
 * Los dos valores salen del corpus de respuestas reales (`test/corpus.json`), no de
 * la intuición: 7 casos, 16 pares etiquetados a mano, dos pasadas ciegas cada uno,
 * recogidas el 2026-10-16 con `opencode/cat-jam-free` (`corpus` los recoge,
 * `corpus:ajustar` los barre, `test/corpus.test.ts` los fija). Medido:
 *  - la similitud más baja de un par que es el mismo hallazgo es 0.19, así que con
 *    el umbral en 0.20 el test falla ese par (dos reglas distintas para el mismo
 *    defecto: «DRY» contra la regla larga);
 *  - el par «distinto» más parecido también está en 0.53 —dos `catch` distintos a 5
 *    líneas, con la misma regla y la misma redacción—, de modo que la similitud no
 *    puede separarlo: solo lo hace la línea, y por eso la tolerancia tiene que
 *    quedarse por debajo de 5 (con 5 el test falla ese par, y su simétrico);
 *  - los demás pares «distintos» están en 0.00 y sin línea (`FINDING` mal formado),
 *    que cualquier umbral por encima de 0 deja fuera.
 * Elegidos 0.15 y 3: el 0.15 queda por debajo del 0.19 que el corpus exige y por
 * encima del 0.00 que hay que excluir, y el 3 es el desvío que ya estaba y que el
 * corpus admite (solo lo acota por arriba). Subir cualquiera de los dos rompe el
 * test del corpus: 0.20 deja 1 de 16 pares mal, 5 líneas dejan 2.
 */
export const SIMILITUD_MINIMA = 0.15

export interface Umbrales {
  /** Jaccard mínimo entre los tokens de regla y evidencia para considerarlos el mismo hallazgo. */
  similitud: number
  /** Desvío máximo de línea entre los dos hallazgos del mismo par. */
  lineas: number
}

export const UMBRALES_POR_DEFECTO: Umbrales = { similitud: SIMILITUD_MINIMA, lineas: TOLERANCIA_LINEAS }

export interface Clasificacion {
  /** Reproducidos y sobre el cambio: bloquean. */
  bloqueantes: Hallazgo[]
  /** Reproducidos pero sobre líneas que nadie tocó: se avisan, no bloquean. */
  reproducidosFueraDelCambio: Hallazgo[]
  /** Vistos en una sola pasada: se avisan, no bloquean. */
  sueltos: Hallazgo[]
}

export function clasificar(
  primera: Revision,
  segunda: Revision,
  alcances: ReadonlyMap<string, AlcanceFichero>,
  umbrales: Umbrales = UMBRALES_POR_DEFECTO,
): Clasificacion {
  const candidatos = [hallazgosQueCuentan(primera), hallazgosQueCuentan(segunda)]
  const izquierda = candidatos[0] ?? []
  const derecha = candidatos[1] ?? []
  const usados = new Set<number>()
  const clasificacion: Clasificacion = {
    bloqueantes: [],
    reproducidosFueraDelCambio: [],
    sueltos: [],
  }
  for (const hallazgo of izquierda) {
    const par = emparejar(hallazgo, derecha, usados, umbrales)
    if (par === null) {
      clasificacion.sueltos.push(hallazgo)
      continue
    }
    if (dentroDelCambio(hallazgo, alcances, umbrales.lineas)) {
      clasificacion.bloqueantes.push(hallazgo)
    } else {
      clasificacion.reproducidosFueraDelCambio.push(hallazgo)
    }
  }
  derecha.forEach((hallazgo, indice) => {
    if (!usados.has(indice)) {
      clasificacion.sueltos.push(hallazgo)
    }
  })
  return clasificacion
}

/** Un PASSED no bloquea nada: sus hallazgos, si los trae, son contradictorios y se ignoran. */
function hallazgosQueCuentan(revision: Revision): Hallazgo[] {
  return revision.veredicto === 'FAILED' ? revision.hallazgos : []
}

function emparejar(
  hallazgo: Hallazgo,
  otros: readonly Hallazgo[],
  usados: Set<number>,
  umbrales: Umbrales,
): Hallazgo | null {
  let indice = -1
  for (let i = 0; i < otros.length; i += 1) {
    const otro = otros[i]
    if (otro !== undefined && !usados.has(i) && esElMismoHallazgo(hallazgo, otro, umbrales)) {
      indice = i
      break
    }
  }
  if (indice === -1) {
    return null
  }
  usados.add(indice)
  return otros[indice] ?? null
}

export function esElMismoHallazgo(
  uno: Hallazgo,
  otro: Hallazgo,
  umbrales: Umbrales = UMBRALES_POR_DEFECTO,
): boolean {
  return (
    mismaRuta(uno.ruta, otro.ruta) &&
    lineasCompatibles(uno.linea, otro.linea, umbrales.lineas) &&
    reglasCompatibles(uno, otro, umbrales.similitud)
  )
}

function mismaRuta(uno: string, otro: string): boolean {
  const a = normalizarRuta(uno)
  const b = normalizarRuta(otro)
  return a === b || nombreBase(a) === nombreBase(b)
}

/** Sin número de línea en alguno de los dos, decide la regla: no se descarta el par. */
function lineasCompatibles(uno: number | null, otro: number | null, tolerancia: number): boolean {
  if (uno === null || otro === null) {
    return true
  }
  return Math.abs(uno - otro) <= tolerancia
}

export function dentroDelCambio(
  hallazgo: Hallazgo,
  alcances: ReadonlyMap<string, AlcanceFichero>,
  tolerancia: number = TOLERANCIA_LINEAS,
): boolean {
  const alcance = buscarAlcance(alcances, hallazgo.ruta)
  return alcance !== undefined && señalaElCambio(alcance.hunks, hallazgo.linea, tolerancia)
}

export function buscarAlcance(
  alcances: ReadonlyMap<string, AlcanceFichero>,
  ruta: string,
): AlcanceFichero | undefined {
  const directo = alcances.get(normalizarRuta(ruta))
  if (directo !== undefined) {
    return directo
  }
  const buscado = nombreBase(ruta)
  for (const [clave, alcance] of alcances) {
    if (nombreBase(clave) === buscado) {
      return alcance
    }
  }
  return undefined
}

export function normalizarRuta(ruta: string): string {
  return ruta.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function nombreBase(ruta: string): string {
  const partes = normalizarRuta(ruta).split('/')
  return partes[partes.length - 1] ?? ''
}
