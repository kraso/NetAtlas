import type { Hallazgo } from './hallazgos.js'

/**
 * Cuánto se parecen dos hallazgos de pasadas distintas. Vive aparte del cruce
 * porque es la pieza que el corpus de respuestas reales ajustó: los umbrales
 * están en `reproducibilidad.ts` y la medida, aquí.
 *
 * Dos hallazgos hablan de lo mismo si su texto se parece y sus números de regla
 * no se contradicen. El filtro de números es lo que separa «Módulos de menos de
 * 200 líneas» de «Funciones de menos de 30 líneas», que comparten palabras pero no
 * límite: sin él, un hallazgo de una regla se emparejaría con el de otra y
 * bloquearía.
 *
 * La similitud se mide sobre las regla **y** la evidencia juntas, y no sobre la
 * regla sola, porque el corpus de respuestas reales lo pide: nombrando el mismo
 * defecto, el proveedor escribe «Funciones de menos de 30 líneas, una sola
 * responsabilidad» en una pasada y «Función de una sola responsabilidad» o «DRY»
 * en la otra, y en una tercera escribió la regla en el campo de la evidencia (con
 * `message` como regla). Medido sobre el corpus: con la regla sola y el umbral de
 * hoy, 2 de los 11 pares etiquetados como el mismo hallazgo se quedaban sin unir
 * («DRY» contra «funciones de menos de 30 líneas», y el `message` en el campo de
 * la regla); con la bolsa de las dos, ninguno. Los números de regla se siguen
 * comparando solo entre reglas: son límites («200» contra «30»), no vocabulario.
 */
export function reglasCompatibles(uno: Hallazgo, otro: Hallazgo, similitud: number): boolean {
  if (!numerosCompatibles(tokens(uno.regla), tokens(otro.regla))) {
    return false
  }
  return similitudDe(uno, otro) >= similitud
}

/** Parecido entre dos hallazgos, en [0, 1], sobre los tokens de regla y evidencia. */
export function similitudDe(uno: Hallazgo, otro: Hallazgo): number {
  return jaccard(bolsa(uno), bolsa(otro))
}

function bolsa(hallazgo: Hallazgo): Set<string> {
  return new Set([...tokens(hallazgo.regla), ...tokens(hallazgo.evidencia)])
}

function numerosCompatibles(uno: Set<string>, otro: Set<string>): boolean {
  const numerosUno = [...uno].filter((token) => /^\d+$/.test(token))
  const numerosOtro = [...otro].filter((token) => /^\d+$/.test(token))
  if (numerosUno.length === 0 || numerosOtro.length === 0) {
    return true
  }
  return numerosUno.some((numero) => numerosOtro.includes(numero))
}

const PALABRAS_VACIAS = new Set([
  'como', 'con', 'cuando', 'de', 'del', 'donde', 'el', 'en', 'es', 'esta', 'este', 'la', 'las',
  'le', 'lo', 'los', 'mas', 'más', 'ni', 'no', 'o', 'para', 'pero', 'por', 'que', 'se', 'si',
  'sin', 'sobre', 'son', 'su', 'sus', 'toda', 'todo', 'un', 'una', 'y', 'ya',
])

function tokens(texto: string): Set<string> {
  const partes = texto
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((parte) => (parte.length >= 4 || /^\d+$/.test(parte)) && !PALABRAS_VACIAS.has(parte))
  return new Set(partes)
}

function jaccard(uno: Set<string>, otro: Set<string>): number {
  const mayor = Math.max(uno.size, otro.size)
  if (mayor === 0) {
    return 1
  }
  let comunes = 0
  for (const token of uno) {
    if (otro.has(token)) {
      comunes += 1
    }
  }
  return comunes / mayor
}
