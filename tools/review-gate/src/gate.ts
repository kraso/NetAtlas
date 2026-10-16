import type { AlcanceFichero } from './alcance.js'
import { type Cambio, type Modo, calcularCambio } from './cambio.js'
import { type ConfigGate, leerConfig, leerReglas } from './config.js'
import type { Revision } from './hallazgos.js'
import { type PasoRevision, construirInforme, resumen } from './informe.js'
import { type Mecanicas, revisarMecanicas } from './mecanicas.js'
import { type EntornoPasada, peticionDe, revisar, revisarConfiguracion } from './pasadas.js'
import { construirPrompt } from './prompt.js'
import type { EjecutorRevision } from './proveedor.js'
import { type Clasificacion, clasificar } from './reproducibilidad.js'

/**
 * Política de convergencia del gate, en un solo sitio para el hook local y para
 * el job de CI:
 *
 * 1. Alcance por hunks: se manda la cabecera y las líneas cambiadas, no el
 *    fichero entero. Un hallazgo sobre lo que nadie tocó deja de aparecer.
 * 2. Dos pasadas ciegas sobre el mismo prompt, y bloquea solo lo que aparece en
 *    las dos. Sin estado que recordar, la regla funciona igual en CI (donde no
 *    hay caché ninguna) que en local: el veredicto depende del contenido, no de
 *    la muestra del proveedor.
 * 3. Un hallazgo reproducible bloquea solo si señala una línea del cambio: la
 *    deuda preexistente no puede bloquear para siempre un fichero.
 * 4. Las reglas mecánicas de AGENTS.md —límite de líneas del módulo, declaraciones
 *    de import y nomenclatura— las decide el gate con el contenido delante, en
 *    `mecanicas.ts`: son cuenta, no juicio, y no dependen de la muestra del
 *    proveedor. Los hallazgos del proveedor sobre esas reglas no cuentan.
 *
 * La mecánica de una pasada (pedirla y leerla) vive en `pasadas.ts`; aquí queda
 * cuándo hay una segunda y qué veredicto sale del cruce, más el código de salida.
 */
export const PASADAS_POR_DEFECTO = 2
export const REINTENTOS_POR_DEFECTO = 1
/**
 * Tope de CADA pasada. No sale del `TIMEOUT` del `.gga` (que gobierna un
 * `gga run` a mano y dice 900 s): dos pasadas con ese tope serían media hora.
 * Los 420 s cubren con margen el peor diff medido (316 s para 329 ficheros, con
 * el fichero entero; con alcance por hunks el prompt es mucho menor) y dejan el
 * job de CI —que además instala el proyecto— dentro de sus 20 min.
 */
export const TIMEOUT_POR_PASADA = 420

export interface OpcionesGate {
  raiz: string
  modo: Modo
  base?: string
  pasadas?: number
  timeoutSegundos?: number
  reintentos?: number
  entorno?: NodeJS.ProcessEnv
  crudo?: boolean
  /** Cambio ya resuelto; si falta, se calcula contra git. Existe para poder probar la política sin repositorio. */
  cambio?: Cambio
  ejecutor: EjecutorRevision
}

export interface ResultadoGate {
  codigo: number
  salida: string
}

export function ejecutarGate(opciones: OpcionesGate): ResultadoGate {
  const config = leerConfig(opciones.raiz, opciones.entorno ?? process.env)
  const problema = revisarConfiguracion(config, opciones.raiz)
  if (problema !== null) {
    return { codigo: 3, salida: problema }
  }
  const cambio =
    opciones.cambio ??
    calcularCambio({
      raiz: opciones.raiz,
      modo: opciones.modo,
      ...(opciones.base !== undefined ? { base: opciones.base } : {}),
      config,
    })
  const timeoutSegundos = opciones.timeoutSegundos ?? TIMEOUT_POR_PASADA
  if (cambio.alcances.length === 0) {
    return {
      codigo: 0,
      salida: `${resumen(cambio, config, timeoutSegundos)}\n\nVEREDICTO: PASSED — no hay nada que revisar`,
    }
  }
  const entorno: EntornoPasada = {
    config,
    raiz: opciones.raiz,
    prompt: construirPrompt(leerReglas(opciones.raiz, config), cambio.alcances),
    timeoutSegundos,
  }
  const peticion = peticionDe(entorno)
  const reintentos = opciones.reintentos ?? REINTENTOS_POR_DEFECTO
  const mecanicas = revisarMecanicas(cambio.alcances)
  const primera = revisar(opciones.ejecutor, peticion, reintentos)
  if ('motivo' in primera) {
    return sinDecision(primera.motivo, cambio, config, timeoutSegundos, mecanicas)
  }
  if ((opciones.pasadas ?? PASADAS_POR_DEFECTO) < 2 || sinNadaQueJuzgar(primera.revision)) {
    return {
      codigo: codigoDe(0, mecanicas),
      salida: construirInforme({
        cambio,
        config,
        timeoutSegundos,
        pasos: [primera],
        clasificacion: vacia(),
        mecanicas,
        crudo: opciones.crudo === true,
      }),
    }
  }
  const segunda = revisar(opciones.ejecutor, peticion, reintentos)
  if ('motivo' in segunda) {
    return sinDecision(segunda.motivo, cambio, config, timeoutSegundos, mecanicas)
  }
  const clasificacion = clasificar(primera.revision, segunda.revision, mapaAlcances(cambio.alcances))
  return {
    codigo: codigoDe(clasificacion.bloqueantes.length, mecanicas),
    salida: construirInforme({
      cambio,
      config,
      timeoutSegundos,
      pasos: [primera, segunda],
      clasificacion,
      mecanicas,
      crudo: opciones.crudo === true,
    }),
  }
}

/** Bloquea lo reproducible del proveedor y lo mecánico que el gate comprueba solo. */
function codigoDe(reproducidos: number, mecanicas: Mecanicas): number {
  return reproducidos + mecanicas.bloqueantes.length > 0 ? 1 : 0
}

/**
 * Sin hallazgos que juzgar no hace falta una segunda pasada: el cruce solo bloquea
 * lo que aparece en las dos, así que una pasada suelta no puede bloquear nada. Cubre
 * el PASSED limpio y también el FAILED cuyos hallazgos eran todos de reglas
 * mecánicas —de esas ya decidió el gate con el contenido delante—, que si no
 * gastaría una ronda entera del proveedor para nada.
 */
function sinNadaQueJuzgar(revision: Revision): boolean {
  return revision.hallazgos.length === 0
}

export function mapaAlcances(alcances: readonly AlcanceFichero[]): Map<string, AlcanceFichero> {
  return new Map(alcances.map((alcance) => [alcance.ruta, alcance]))
}

function vacia(): Clasificacion {
  return { bloqueantes: [], reproducidosFueraDelCambio: [], sueltos: [] }
}

function sinDecision(
  motivo: string,
  cambio: Cambio,
  config: ConfigGate,
  timeoutSegundos: number,
  mecanicas: Mecanicas,
): ResultadoGate {
  const pendientes = mecanicas.bloqueantes.map(
    (hallazgo) => `  - ${hallazgo.ruta}:${hallazgo.linea ?? '-'} · ${hallazgo.regla} · ${hallazgo.evidencia}`,
  )
  const extra =
    pendientes.length === 0
      ? []
      : ['', `Lo que el gate ya sabe sin el proveedor (${pendientes.length}):`, ...pendientes]
  return {
    codigo: 2,
    salida: `${resumen(cambio, config, timeoutSegundos)}\n\nLa puerta no pudo decidir: ${motivo}\nNo se aprueba nada por no poder leer la respuesta: arregla el proveedor o vuelve a intentarlo.${extra.join('\n')}`,
  }
}
