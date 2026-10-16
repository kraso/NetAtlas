import { describe, expect, it } from 'vitest'
import { interpretarRevision, type Hallazgo } from '../src/hallazgos.js'
import { esReglaMecanica } from '../src/mecanicas.js'
import { UMBRALES_POR_DEFECTO, esElMismoHallazgo } from '../src/reproducibilidad.js'
import { leerCorpus, type MuestraCorpus } from '../scripts/corpus-tipos.js'

/**
 * El cruce de las dos pasadas medido contra respuestas reales. Cada par que se
 * leyó a mano (mismo hallazgo / hallazgos distintos) tiene que salir como se
 * leyó con los umbrales que hay hoy en el código: si alguien los mueve, esto
 * falla y dice qué par dejó de funcionar.
 *
 * El corpus lo escribe `pnpm --filter @netatlas/review-gate corpus`, que manda el
 * prompt del gate dos veces por el transporte del gate. Sin ventana de proveedor
 * el corpus está vacío y estas comprobaciones se saltan (el motivo queda dicho en
 * el resumen del run); no es un aprobado, es un corpus pendiente.
 */
const corpus = leerCorpus()
const pasadas = corpus.muestras.map((muestra) => ({
  muestra,
  primera: hallazgosDe(muestra.respuestas[0]),
  segunda: hallazgosDe(muestra.respuestas[1]),
}))
const etiquetas = pasadas.flatMap((pasada) =>
  (pasada.muestra.etiquetas ?? []).map((etiqueta) => ({ ...etiqueta, muestra: pasada.muestra.id })),
)
const SIN_CORPUS = etiquetas.length === 0

/** La mitad del gate que se mide: veredicto y hallazgos que cuentan. */
function hallazgosDe(texto: string): Hallazgo[] {
  const lectura = interpretarRevision(texto)
  if (!lectura.ok || lectura.revision.veredicto !== 'FAILED') {
    return []
  }
  return lectura.revision.hallazgos.filter((hallazgo) => !esReglaMecanica(hallazgo.regla))
}

function buscados(cual: 'primera' | 'segunda', muestra: string, indice: number): Hallazgo | undefined {
  return pasadas.find((pasada) => pasada.muestra.id === muestra)?.[cual][indice]
}

describe('corpus de respuestas reales', () => {
  it.skipIf(SIN_CORPUS)('cada par etiquetado apunta a dos hallazgos que existen', () => {
    for (const etiqueta of etiquetas) {
      expect(buscados('primera', etiqueta.muestra, etiqueta.a), `${etiqueta.muestra} par(${etiqueta.a})`).toBeDefined()
      expect(buscados('segunda', etiqueta.muestra, etiqueta.b), `${etiqueta.muestra} par(${etiqueta.b})`).toBeDefined()
    }
  })

  it.skipIf(SIN_CORPUS)('el cruce une y separa lo que se leyó a mano', () => {
    for (const etiqueta of etiquetas) {
      const uno = buscados('primera', etiqueta.muestra, etiqueta.a)
      const otro = buscados('segunda', etiqueta.muestra, etiqueta.b)
      if (uno === undefined || otro === undefined) {
        continue
      }
      const une = esElMismoHallazgo(uno, otro, UMBRALES_POR_DEFECTO)
      expect(une, `${etiqueta.muestra} par(${etiqueta.a},${etiqueta.b}) · ${etiqueta.nota}`).toBe(etiqueta.mismo)
    }
  })
})

/** Deja el corpus a la vista del que lee el test: qué ficheros lo componen. */
export function muestrasDelCorpus(): readonly MuestraCorpus[] {
  return corpus.muestras
}
