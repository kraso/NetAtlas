/**
 * Decisión de instalación del hook, separada del sistema de ficheros para poder
 * probarla. El hook de GGA vive en `.git/hooks/` de cada clon, así que la
 * política del gate no viajaba con el repositorio; este instalador escribe el
 * hook versionado (`hook/pre-commit`) que llama al wrapper.
 */
export type AccionInstalacion = 'instalar' | 'reemplazar-gga' | 'rechazar' | 'ya-instalado'

export interface Decision {
  accion: AccionInstalacion
  motivo: string
}

/** Marca de que el hook destino ya es el del gate: el comando que invoca. */
export const MARCA_GATE = 'review:gate'
/** Marca del hook que instala `gga install`; el gate lo releva. */
export const MARCA_GGA = 'GGA START'

export function decideInstalacion(contenidoActual: string | null, forzar: boolean): Decision {
  if (contenidoActual === null) {
    return { accion: 'instalar', motivo: 'no había hook previo' }
  }
  if (contenidoActual.includes(MARCA_GATE)) {
    return { accion: 'ya-instalado', motivo: 'el hook del gate ya estaba instalado' }
  }
  if (contenidoActual.includes(MARCA_GGA) || contenidoActual.includes('gga run')) {
    return {
      accion: 'reemplazar-gga',
      motivo: 'había un hook de GGA; se conserva una copia y el gate toma el relevo',
    }
  }
  if (forzar) {
    return { accion: 'instalar', motivo: 'hook ajeno reemplazado con --force (se conserva copia)' }
  }
  return {
    accion: 'rechazar',
    motivo: 'hay un hook que no es del gate ni de GGA; repite con --force si quieres reemplazarlo',
  }
}
