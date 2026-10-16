import type { Cambio } from './cambio.js'
import type { ConfigGate } from './config.js'
import type { Hallazgo, Revision } from './hallazgos.js'
import type { Mecanicas } from './mecanicas.js'
import type { Clasificacion } from './reproducibilidad.js'

/**
 * El informe es lo que lee quien commitea (y el log del job de CI): dice qué se
 * revisó, qué pasada dijo qué y, sobre todo, qué bloquea y qué no. Separarlo de
 * la orquestación mantiene cada módulo por debajo del límite de 200 líneas.
 */
export interface PasoRevision {
  revision: Revision
  texto: string
  /** Hallazgos del proveedor sobre reglas mecánicas: no cuentan y se dicen. */
  ignorados: Hallazgo[]
}

export interface DatosInforme {
  cambio: Cambio
  config: ConfigGate
  timeoutSegundos: number
  pasos: PasoRevision[]
  clasificacion: Clasificacion
  mecanicas: Mecanicas
  crudo: boolean
}

export function construirInforme(datos: DatosInforme): string {
  const { cambio, config, timeoutSegundos, pasos, clasificacion, mecanicas, crudo } = datos
  const lineas = [
    resumen(cambio, config, timeoutSegundos),
    '',
    ...pasos.map(
      (paso, indice) =>
        `Pasada ${indice + 1}: STATUS: ${paso.revision.veredicto} (${paso.revision.hallazgos.length} hallazgos)`,
    ),
  ]
  if (pasos.length > 1) {
    lineas.push(
      ...seccion('Bloquean — reproducidos en las dos pasadas y sobre líneas cambiadas', clasificacion.bloqueantes),
      ...seccion('De una sola pasada — no bloquean (la otra pasada no los vio)', clasificacion.sueltos),
      ...seccion(
        'Reproducidos fuera del cambio — no bloquean (código que nadie tocó)',
        clasificacion.reproducidosFueraDelCambio,
      ),
    )
  }
  // Las reglas mecánicas no dependen de las dos pasadas: se informan siempre.
  lineas.push(
    ...seccionesMecanicas(mecanicas),
    ...seccion('Ignorados del proveedor — reglas mecánicas, ya decididas aquí', ignoradosDe(pasos)),
  )
  lineas.push('', veredicto(clasificacion, pasos, mecanicas))
  if (crudo) {
    lineas.push(...crudoDe(pasos))
  }
  return lineas.join('\n')
}

/**
 * Lo que el gate decide sin el proveedor, en secciones. Lo usan el informe del run
 * y el simulacro del CLI (`--dry-run`), para que digan lo mismo.
 */
export function seccionesMecanicas(mecanicas: Mecanicas): string[] {
  return [
    ...seccion('Mecánicos — los comprueba el gate con el contenido (bloquean)', mecanicas.bloqueantes),
    ...seccion('Mecánicos preexistentes — no bloquean (el cambio no cruza el límite)', mecanicas.avisos),
    ...seccion('Mecánicos informativos — los cuenta el gate y no bloquean', mecanicas.informativos),
  ]
}

/** Hallazgos mecánicos del proveedor, sin repetir el mismo en las dos pasadas. */
function ignoradosDe(pasos: readonly PasoRevision[]): Hallazgo[] {
  const vistos = new Set<string>()
  const salida: Hallazgo[] = []
  for (const paso of pasos) {
    for (const hallazgo of paso.ignorados) {
      const clave = `${hallazgo.ruta}|${hallazgo.linea ?? '-'}|${hallazgo.regla}`
      if (vistos.has(clave)) {
        continue
      }
      vistos.add(clave)
      salida.push(hallazgo)
    }
  }
  return salida
}

export function resumen(cambio: Cambio, config: ConfigGate, timeoutSegundos: number): string {
  const modo = cambio.modo === 'pr' ? `pr (${cambio.base}...HEAD)` : 'staged (índice: lo que se va a commitear)'
  const detalle = cambio.alcances.map(
    (alcance) =>
      `  - ${alcance.ruta} (${alcance.lineasTotales} líneas, ${alcance.lineasCambiadas} cambiadas, ${alcance.imports} imports)`,
  )
  const ignorados =
    cambio.ignorados.length === 0 ? [] : [`Sin cambios de texto: ${cambio.ignorados.join(', ')}`]
  return [
    'Gate de review — alcance por hunks, pasadas ciegas',
    `Modo: ${modo} · Proveedor: ${config.proveedor} · tope por pasada: ${timeoutSegundos}s`,
    `Ficheros en el alcance (${cambio.alcances.length}):`,
    ...detalle,
    ...ignorados,
  ].join('\n')
}

function seccion(titulo: string, hallazgos: readonly Hallazgo[]): string[] {
  if (hallazgos.length === 0) {
    return []
  }
  return [
    '',
    `${titulo} (${hallazgos.length}):`,
    ...hallazgos.map(
      (hallazgo) => `  - ${hallazgo.ruta}:${hallazgo.linea ?? '-'} · ${hallazgo.regla} · ${hallazgo.evidencia}`,
    ),
  ]
}

function veredicto(clasificacion: Clasificacion, pasos: readonly PasoRevision[], mecanicas: Mecanicas): string {
  const reproducidos = clasificacion.bloqueantes.length
  const mecanicos = mecanicas.bloqueantes.length
  if (reproducidos + mecanicos > 0) {
    const partes = [
      reproducidos > 0 ? `${reproducidos} hallazgo(s) reproducido(s) sobre el cambio` : '',
      mecanicos > 0 ? `${mecanicos} regla(s) mecánica(s) incumplida(s)` : '',
    ].filter((parte) => parte !== '')
    return `VEREDICTO: FAILED — ${partes.join(' y ')}`
  }
  if (pasos.length === 1) {
    if (pasos[0]?.revision.veredicto === 'FAILED') {
      return 'VEREDICTO: PASSED — la pasada solo señaló reglas mecánicas, que decide el gate con el contenido: no quedó ningún hallazgo que juzgar'
    }
    return 'VEREDICTO: PASSED — la primera pasada aprobó sin hallazgos; no hizo falta una segunda'
  }
  return 'VEREDICTO: PASSED — ningún hallazgo reproducible sobre el cambio'
}

function crudoDe(pasos: readonly PasoRevision[]): string[] {
  return pasos.flatMap((paso, indice) => ['', `--- salida del proveedor (pasada ${indice + 1}) ---`, paso.texto])
}
