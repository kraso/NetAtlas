import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Puerto del transporte: una petición de revisión, una respuesta de texto. El
 * gate no sabe si detrás hay opencode, claude o un doble de prueba; en
 * producción lo implementa el shim de bash, que reutiliza la resolución de
 * proveedor de GGA en vez de reimplementar credenciales y CLIs.
 */
export interface PeticionRevision {
  prompt: string
  proveedor: string
  timeoutSegundos: number
  variante: string
  agente: string
}

export type ResultadoRevision = { ok: true; texto: string } | { ok: false; motivo: string }

export interface EjecutorRevision {
  revisar(peticion: PeticionRevision): ResultadoRevision
}

/** El shim vive junto al tool: la ruta se deriva del módulo, no del cwd. */
export const RUTA_SHIM = fileURLToPath(new URL('../scripts/proveedor.sh', import.meta.url))

/** Códigos del shim (contrato propio, distinto de los del gate). */
const SHIM_CONFIGURACION = 3
const SHIM_TIMEOUT = 124

export function ejecutorGga(shim: string = RUTA_SHIM): EjecutorRevision {
  return {
    revisar(peticion) {
      const resultado = spawnSync('bash', [shim], {
        input: peticion.prompt,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
        env: entornoDelProveedor(peticion),
      })
      if (resultado.error) {
        return { ok: false, motivo: `no se pudo lanzar el transporte (${shim}): ${resultado.error.message}` }
      }
      const estado = resultado.status ?? 1
      const salida = resultado.stdout ?? ''
      if (estado === 0) {
        return salida.trim() === ''
          ? { ok: false, motivo: 'el proveedor devolvió una respuesta vacía' }
          : { ok: true, texto: salida }
      }
      const pista = ultimaLinea(salida) ?? ultimaLinea(resultado.stderr ?? '') ?? 'sin detalle'
      if (estado === SHIM_TIMEOUT) {
        return { ok: false, motivo: `el proveedor no respondió en ${peticion.timeoutSegundos}s (${pista})` }
      }
      if (estado === SHIM_CONFIGURACION) {
        return { ok: false, motivo: `configuración del transporte: ${pista}` }
      }
      return { ok: false, motivo: `el proveedor falló (código ${estado}): ${pista}` }
    },
  }
}

function entornoDelProveedor(peticion: PeticionRevision): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PROVIDER: peticion.proveedor,
    TIMEOUT: String(peticion.timeoutSegundos),
    OPENCODE_VARIANT: peticion.variante,
    OPENCODE_AGENT: peticion.agente,
  }
}

function ultimaLinea(texto: string): string | null {
  const lineas = texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '')
  return lineas[lineas.length - 1] ?? null
}
