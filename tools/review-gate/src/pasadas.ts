import { type ConfigGate, leerReglas } from './config.js'
import { type Hallazgo, interpretarRevision } from './hallazgos.js'
import type { PasoRevision } from './informe.js'
import { esReglaMecanica } from './mecanicas.js'
import type { EjecutorRevision, PeticionRevision } from './proveedor.js'

/**
 * Una pasada del gate: lo que se le pide al proveedor y lo que se lee de vuelta.
 * Vive aparte de la orquestación (`gate.ts`) porque son dos cosas distintas: allí
 * se decide cuándo hay una segunda pasada y qué veredicto sale del cruce; aquí,
 * cómo se ejecuta una y cómo se interpreta su respuesta.
 */
export interface EntornoPasada {
  config: ConfigGate
  raiz: string
  prompt: string
  timeoutSegundos: number
}

/** Configuración suficiente para lanzar al proveedor; si algo falta, no se corre. */
export function revisarConfiguracion(config: ConfigGate, raiz: string): string | null {
  if (config.proveedor === '') {
    return 'El gate no tiene proveedor: define PROVIDER en .gga (o GGA_PROVIDER en el entorno).'
  }
  try {
    leerReglas(raiz, config)
  } catch {
    return `El gate no encuentra el fichero de reglas «${config.rulesFile}» en ${raiz}.`
  }
  return null
}

export function peticionDe(entorno: EntornoPasada): PeticionRevision {
  const { config, prompt, timeoutSegundos } = entorno
  return {
    prompt,
    proveedor: config.proveedor,
    timeoutSegundos,
    variante: config.opencodeVariant,
    agente: config.opencodeAgent,
  }
}

/** Una pasada con reintentos: el fallo del proveedor se reintenta, la ambigüedad también. */
export function revisar(
  ejecutor: EjecutorRevision,
  peticion: PeticionRevision,
  reintentos: number,
): PasoRevision | { motivo: string } {
  let motivo = 'sin intentos'
  for (let intento = 0; intento <= reintentos; intento += 1) {
    const resultado = ejecutor.revisar(peticion)
    if (!resultado.ok) {
      motivo = resultado.motivo
      continue
    }
    const paso = leerPaso(resultado.texto)
    if ('motivo' in paso) {
      motivo = paso.motivo
      continue
    }
    return paso
  }
  return { motivo }
}

/**
 * Una pasada leída, sin los hallazgos que hablan de reglas mecánicas: de esas ya
 * decidió el gate, y se guardan aparte para poder decirlo en el informe.
 */
export function leerPaso(texto: string): PasoRevision | { motivo: string } {
  const lectura = interpretarRevision(texto)
  if (!lectura.ok) {
    return { motivo: lectura.motivo }
  }
  const { hallazgos } = lectura.revision
  const esMecanico = (hallazgo: Hallazgo): boolean => esReglaMecanica(hallazgo.regla)
  return {
    revision: { ...lectura.revision, hallazgos: hallazgos.filter((hallazgo) => !esMecanico(hallazgo)) },
    texto,
    ignorados: hallazgos.filter(esMecanico),
  }
}
