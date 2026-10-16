import type { AlcanceFichero } from './alcance.js'

/**
 * Prompt del gate. Se construye aquí y no dentro de GGA porque el alcance por
 * hunks y el cruce de hallazgos necesitan dos cosas que GGA no controla: mandar
 * solo las líneas cambiadas (GGA manda el fichero entero, `git show :<ruta>`) y
 * pedir los hallazgos en un formato que se pueda cruzar entre pasadas.
 *
 * Las dos pasadas reciben este mismo texto, sin saber que hay una segunda: la
 * reproducibilidad mide al proveedor, no al prompt.
 */
export function construirPrompt(reglas: string, alcances: readonly AlcanceFichero[]): string {
  return [
    'Eres el revisor de código de este repositorio.',
    '',
    '=== REGLAS DEL REPOSITORIO ===',
    reglas,
    '=== FIN REGLAS ===',
    '',
    '=== ALCANCE DE ESTA REVISIÓN ===',
    'De cada fichero cambiado se incluyen su cabecera y SOLO las líneas cambiadas,',
    'con el número de línea real del fichero. Los huecos van marcados con',
    '«… (líneas X-Y sin cambios, omitidas) …». Las métricas declaradas de cada',
    'fichero (total de líneas, declaraciones de import) son exactas.',
    '',
    'Juzga el cambio entregado: un hallazgo sobre líneas que no aparecen aquí no es',
    'verificable y no cuenta. Solo reporta violaciones confirmadas de las reglas: si',
    'algo es dudoso, no lo reportes.',
    '',
    'Las reglas mecánicas —límite de líneas del módulo, declaraciones de import y',
    'nomenclatura— las comprueba la herramienta que arma este prompt, con el contenido',
    'delante: no las reportes, ni siquiera si crees que se incumplen. Tu juicio es',
    'para todo lo demás.',
    '=== FIN ALCANCE ===',
    '',
    '=== FICHEROS ===',
    ...alcances.map((alcance) => alcance.texto),
    '=== FIN FICHEROS ===',
    '',
    '=== FORMATO DE RESPUESTA (obligatorio) ===',
    'La PRIMERA línea del review es exactamente una de estas dos:',
    'STATUS: PASSED',
    'STATUS: FAILED',
    '',
    'Escribe el veredicto una sola vez, al principio. No repitas la palabra STATUS en',
    'ninguna otra línea, ni cites este formato.',
    '',
    'Si STATUS: FAILED, escribe después una línea por hallazgo, con este formato exacto:',
    'FINDING: <ruta>|<línea>|<regla>|<evidencia>',
    '- ruta: la ruta tal como aparece en su bloque «--- FILE: … ---».',
    '- línea: el número de línea real del fichero; "-" si el hallazgo no es de una línea.',
    '- regla: la regla concreta de las REGLAS DEL REPOSITORIO que se viola.',
    '- evidencia: una sola línea, concreta, sin saltos.',
    '',
    'Si no hay ninguna violación: STATUS: PASSED y ninguna línea FINDING.',
    '=== FIN FORMATO ===',
  ].join('\n')
}
