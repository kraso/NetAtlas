/**
 * Lectura de la respuesta del proveedor. El veredicto se busca en todo el
 * transcript (el proveedor es un agente y contesta tras un eco largo) pero solo
 * al inicio de línea, y dos veredictos distintos dejan la respuesta ambigua:
 * igual que el contrato de AGENTS.md, no se adivina.
 *
 * Un FAILED sin hallazgos parseables no es un PASSED: es una respuesta que la
 * puerta no puede juzgar, y se trata como tal.
 */
export type Veredicto = 'PASSED' | 'FAILED'

export interface Hallazgo {
  ruta: string
  linea: number | null
  regla: string
  evidencia: string
}

export interface Revision {
  veredicto: Veredicto
  hallazgos: Hallazgo[]
  /** Un veredicto PASSED con líneas FINDING es contradictorio: se avisa y se ignoran. */
  contradictorio: boolean
}

export type LecturaRevision = { ok: true; revision: Revision } | { ok: false; motivo: string }

const ANSI = /\u001b\[[0-9;]*[mK]/g
const ENVOLTORIOS = /^(\*\*|__|`|#\s|>\s|[-*]\s|\d+\.\s)+|(\*\*|__|`)+$/g

export function interpretarRevision(texto: string): LecturaRevision {
  const lineas = texto.split('\n').map(normalizarLinea)
  const veredictos = lineas.flatMap((linea) => {
    const encontrado = /^STATUS:\s*(PASSED|FAILED)\b/.exec(linea)
    return encontrado?.[1] === undefined ? [] : [encontrado[1] as Veredicto]
  })
  const distintos = [...new Set(veredictos)]
  if (distintos.length > 1) {
    return { ok: false, motivo: 'la respuesta trae veredictos distintos (PASSED y FAILED)' }
  }
  const veredicto = distintos[0]
  if (veredicto === undefined) {
    return { ok: false, motivo: 'la respuesta no trae ninguna línea «STATUS: PASSED|FAILED»' }
  }
  const hallazgos = lineas.flatMap(leerHallazgo)
  if (veredicto === 'FAILED' && hallazgos.length === 0) {
    return { ok: false, motivo: 'un veredicto FAILED sin ninguna línea «FINDING:» parseable' }
  }
  return {
    ok: true,
    revision: { veredicto, hallazgos, contradictorio: veredicto === 'PASSED' && hallazgos.length > 0 },
  }
}

function normalizarLinea(linea: string): string {
  return linea.replace(ANSI, '').replace(ENVOLTORIOS, '').trim()
}

function leerHallazgo(linea: string): Hallazgo[] {
  const encontrado = /^FINDING:\s*(.+)$/.exec(linea)
  if (encontrado?.[1] === undefined) {
    return []
  }
  const campos = encontrado[1].split('|')
  if (campos.length < 3) {
    return []
  }
  // Con tres campos se entiende que la pasada omitió la línea (`ruta|regla|evidencia`).
  const sinLinea = campos.length === 3
  const [rutaCampo, segundo, tercero] = campos
  const lineaCampo = sinLinea ? '-' : segundo
  const reglaCampo = sinLinea ? segundo : tercero
  if (rutaCampo === undefined || lineaCampo === undefined || reglaCampo === undefined) {
    return []
  }
  const evidencia = campos.slice(sinLinea ? 2 : 3).join('|').trim()
  const { ruta, linea: lineaDeLaRuta } = leerRuta(rutaCampo)
  if (ruta === '') {
    return []
  }
  return [
    {
      ruta,
      linea: lineaDeLaRuta ?? leerLinea(lineaCampo),
      regla: reglaCampo.replace(/`/g, '').trim(),
      evidencia,
    },
  ]
}

/** Acepta `ruta.ts`, `ruta.ts:88` y `` `ruta.ts` `` por igual. */
function leerRuta(campo: string): { ruta: string; linea: number | null } {
  const limpia = campo.replace(/`/g, '').replace(/\\/g, '/').trim().replace(/^\.\//, '')
  const conLinea = /^(.*):(\d+)$/.exec(limpia)
  if (conLinea?.[1] !== undefined && conLinea[2] !== undefined) {
    return { ruta: conLinea[1], linea: Number.parseInt(conLinea[2], 10) }
  }
  return { ruta: limpia, linea: null }
}

function leerLinea(campo: string): number | null {
  const primera = /\d+/.exec(campo.replace(/`/g, ''))
  return primera === null ? null : Number.parseInt(primera[0], 10)
}
