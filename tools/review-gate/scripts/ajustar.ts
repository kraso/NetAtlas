#!/usr/bin/env tsx
/**
 * ajustar — mide el cruce de las dos pasadas contra el corpus de respuestas
 * reales y barre los dos umbrales.
 *
 * `--listar` imprime, por caso, los hallazgos de cada pasada con su índice, la
 * línea y la regla, más los pares candidatos (mismo fichero y líneas cercanas)
 * con lo que decidirían los umbrales de hoy: es lo que se lee para etiquetar
 * (`etiquetas` en `test/corpus.json`).
 *
 * Sin argumentos barre `similitud × líneas` y dice cuántos pares etiquetados
 * acierta cada combinación; el máximo es el que se pone en el código. Uso:
 *
 *   pnpm --filter @netatlas/review-gate corpus:listar
 *   pnpm --filter @netatlas/review-gate corpus:ajustar
 */
import { construirAlcance, type AlcanceFichero } from '../src/alcance.js'
import { interpretarRevision, type Hallazgo, type Revision } from '../src/hallazgos.js'
import { esReglaMecanica } from '../src/mecanicas.js'
import {
  SIMILITUD_MINIMA,
  UMBRALES_POR_DEFECTO,
  clasificar,
  esElMismoHallazgo,
  similitudDe,
} from '../src/reproducibilidad.js'
import { RUTA_CORPUS, leerCorpus, type Etiqueta, type MuestraCorpus } from './corpus-tipos.js'

/** Rejilla del barrido: similitud de regla × desvío tolerado de líneas. */
const SIMILITUDES = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
const LINEAS = [0, 1, 2, 3, 4, 5, 8, 12]

/** Distancia con la que dos hallazgos llegan a ser candidatos a par. */
const CERCANIA = 12

/**
 * Lo que el gate decide con los umbrales de hoy sobre cada caso real: cuántos
 * hallazgos bloquean, cuántos se quedan fuera del cambio y cuántos vio una sola
 * pasada. Es el efecto del ajuste sobre el veredicto, no solo sobre el cruce.
 */
function clasificarTodo(pasadas: readonly Pasadas[]): void {
  for (const pasada of pasadas) {
    const alcances = alcancesDe(pasada.muestra)
    const revisiones = [leerRevision(pasada.muestra.respuestas[0]), leerRevision(pasada.muestra.respuestas[1])]
    if (revisiones[0] === undefined || revisiones[1] === undefined) {
      console.log(`\n=== ${pasada.muestra.id}: respuesta ilegible`)
      continue
    }
    const clasificacion = clasificar(revisiones[0], revisiones[1], alcances)
    console.log(`\n=== ${pasada.muestra.id} · ${pasada.muestra.proveedor}`)
    console.log(`  bloquean: ${clasificacion.bloqueantes.length} · fuera del cambio: ${clasificacion.reproducidosFueraDelCambio.length} · de una sola pasada: ${clasificacion.sueltos.length}`)
    for (const hallazgo of clasificacion.bloqueantes) {
      console.log(`  BLOQUEA ${hallazgo.ruta}:${hallazgo.linea ?? '-'} · ${hallazgo.regla}`)
    }
    for (const hallazgo of clasificacion.reproducidosFueraDelCambio) {
      console.log(`  FUERA   ${hallazgo.ruta}:${hallazgo.linea ?? '-'} · ${hallazgo.regla}`)
    }
    for (const hallazgo of clasificacion.sueltos) {
      console.log(`  SUELTO  ${hallazgo.ruta}:${hallazgo.linea ?? '-'} · ${hallazgo.regla}`)
    }
  }
}

function leerRevision(texto: string): Revision | undefined {
  const lectura = interpretarRevision(texto)
  if (!lectura.ok) {
    return undefined
  }
  const { hallazgos: encontrados } = lectura.revision
  return {
    ...lectura.revision,
    hallazgos: encontrados.filter((hallazgo) => !esReglaMecanica(hallazgo.regla)),
  }
}

interface Pasadas {
  muestra: MuestraCorpus
  primera: Hallazgo[]
  segunda: Hallazgo[]
}

main()

function main(): void {
  const args = process.argv.slice(2)
  const ruta = valor(args, 'corpus') ?? RUTA_CORPUS
  const corpus = leerCorpus(ruta)
  const pasadas = corpus.muestras.map(leerPasadas)
  console.log(`corpus: ${corpus.muestras.length} muestra(s) · ${etiquetasDe(pasadas).length} par(es) etiquetado(s)`)
  if (pasadas.length === 0) {
    console.log('Sin respuestas reales todavía: corre `pnpm --filter @netatlas/review-gate corpus`.')
    return
  }
  if (args.includes('--listar')) {
    listar(pasadas)
    return
  }
  if (args.includes('--clasificar')) {
    clasificarTodo(pasadas)
    return
  }
  barrer(pasadas)
}

function leerPasadas(muestra: MuestraCorpus): Pasadas {
  return {
    muestra,
    primera: hallazgos(muestra.respuestas[0]),
    segunda: hallazgos(muestra.respuestas[1]),
  }
}

/** La mitad del gate que importa aquí: el veredicto y los hallazgos que cuentan. */
function hallazgos(texto: string): Hallazgo[] {
  const lectura = interpretarRevision(texto)
  if (!lectura.ok) {
    return []
  }
  const revision: Revision = lectura.revision
  return revision.veredicto === 'FAILED'
    ? revision.hallazgos.filter((hallazgo) => !esReglaMecanica(hallazgo.regla))
    : []
}

function etiquetasDe(pasadas: readonly Pasadas[]): Array<Etiqueta & { muestra: string }> {
  return pasadas.flatMap((pasada) =>
    (pasada.muestra.etiquetas ?? []).map((etiqueta) => ({ ...etiqueta, muestra: pasada.muestra.id })),
  )
}

function listar(pasadas: readonly Pasadas[]): void {
  for (const pasada of pasadas) {
    console.log(`\n=== ${pasada.muestra.id} · ${pasada.muestra.esperadas}`)
    describir('pasada 1', pasada.primera)
    describir('pasada 2', pasada.segunda)
    for (const { a, b, distancia } of candidatos(pasada)) {
      const uno = pasada.primera[a] as Hallazgo
      const otro = pasada.segunda[b] as Hallazgo
      const une = esElMismoHallazgo(uno, otro)
      console.log(`  par(${a},${b}) Δlínea=${distancia} similitud=${similitudDe(uno, otro).toFixed(2)} → hoy ${une ? 'UNE' : 'separa'}`)
    }
  }
}

function describir(titulo: string, hallazgosLista: readonly Hallazgo[]): void {
  console.log(`  ${titulo}:`)
  if (hallazgosLista.length === 0) {
    console.log('    (sin hallazgos)')
    return
  }
  hallazgosLista.forEach((hallazgo, indice) => {
    console.log(`    [${indice}] ${hallazgo.ruta}:${hallazgo.linea ?? '-'} · ${hallazgo.regla}`)
    console.log(`        ${hallazgo.evidencia.slice(0, 120)}`)
  })
}

function candidatos(pasada: Pasadas): Array<{ a: number; b: number; distancia: number }> {
  const salida: Array<{ a: number; b: number; distancia: number }> = []
  pasada.primera.forEach((uno, a) => {
    pasada.segunda.forEach((otro, b) => {
      if (mismoFichero(uno, otro) && cerca(uno, otro)) {
        salida.push({ a, b, distancia: distancia(uno, otro) })
      }
    })
  })
  return salida
}

function mismoFichero(uno: Hallazgo, otro: Hallazgo): boolean {
  const base = (ruta: string): string => ruta.split('/').pop() ?? ''
  return base(uno.ruta) === base(otro.ruta)
}

function cerca(uno: Hallazgo, otro: Hallazgo): boolean {
  return distancia(uno, otro) <= CERCANIA
}

function distancia(uno: Hallazgo, otro: Hallazgo): number {
  return uno.linea === null || otro.linea === null ? 0 : Math.abs(uno.linea - otro.linea)
}

function barrer(pasadas: readonly Pasadas[]): void {
  const etiquetas = etiquetasDe(pasadas)
  if (etiquetas.length === 0) {
    console.log('Nada que barrer: el corpus no tiene pares etiquetados (`--listar` para leerlos).')
    return
  }
  console.log(`\naciertos sobre ${etiquetas.length} par(es) etiquetado(s) · filas=similitud, columnas=líneas`)
  console.log(`        ${LINEAS.map((lineas) => String(lineas).padStart(5, ' ')).join('')}`)
  const orden = SIMILITUDES.map((similitud) => ({
    similitud,
    aciertos: LINEAS.map((lineas) => etiquetas.filter((etiqueta) => acierta(pasadas, etiqueta, similitud, lineas)).length),
  }))
  for (const fila of orden) {
    const celdas = fila.aciertos
      .map((aciertos) => `${String(aciertos).padStart(5, ' ')}${aciertos === etiquetas.length ? '*' : ' '}`)
      .join('')
    console.log(`  ${fila.similitud.toFixed(2)}  ${celdas}`)
  }
  console.log('  (* = pleno: acierta todos los pares etiquetados)')
  console.log(`\nhoy: similitud=${SIMILITUD_MINIMA} líneas=${UMBRALES_POR_DEFECTO.lineas}`)
  for (const etiqueta of etiquetas.filter(
    (etiqueta) => !acierta(pasadas, etiqueta, SIMILITUD_MINIMA, UMBRALES_POR_DEFECTO.lineas),
  )) {
    console.log(`  falla ${etiqueta.muestra} par(${etiqueta.a},${etiqueta.b}) esperado=${etiqueta.mismo ? 'mismo' : 'distinto'} · ${etiqueta.nota}`)
  }
}

function acierta(pasadas: readonly Pasadas[], etiqueta: Etiqueta & { muestra: string }, similitud: number, lineas: number): boolean {
  const pasada = pasadas.find((candidata) => candidata.muestra.id === etiqueta.muestra)
  const uno = pasada?.primera[etiqueta.a]
  const otro = pasada?.segunda[etiqueta.b]
  if (uno === undefined || otro === undefined) {
    return false
  }
  return esElMismoHallazgo(uno, otro, { similitud, lineas }) === etiqueta.mismo
}

export function alcancesDe(muestra: MuestraCorpus): Map<string, AlcanceFichero> {
  return new Map(
    muestra.alcance.map((fichero) => [
      fichero.ruta,
      construirAlcance({ ruta: fichero.ruta, contenido: fichero.contenido, hunks: fichero.hunks }),
    ]),
  )
}

function valor(args: readonly string[], nombre: string): string | undefined {
  const prefijo = `--${nombre}=`
  return args.find((arg) => arg.startsWith(prefijo))?.slice(prefijo.length)
}
