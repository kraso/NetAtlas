import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirAlcance, type AlcanceFichero } from '../src/alcance.js'
import { leerConfig } from '../src/config.js'
import { ejecutarGate } from '../src/gate.js'
import type { EjecutorRevision, PeticionRevision } from '../src/proveedor.js'

export const RAIZ_DEL_REPO = fileURLToPath(new URL('../../..', import.meta.url))

const GGA_POR_DEFECTO = [
  'PROVIDER="prueba:modelo"',
  'FILE_PATTERNS="*.ts,*.tsx"',
  'EXCLUDE_PATTERNS="*.test.ts"',
  'RULES_FILE="AGENTS.md"',
].join('\n')

/** La config real del repositorio, leída de su `.gga` versionado. */
export function leerRepoPropio(): { config: ReturnType<typeof leerConfig> } {
  return { config: leerConfig(RAIZ_DEL_REPO, {}) }
}

/** Proyecto mínimo (`.gga` + `AGENTS.md`) para probar la puerta sin git. */
export function proyectoDePrueba(gga: string = GGA_POR_DEFECTO): string {
  const raiz = mkdtempSync(join(tmpdir(), 'review-gate-'))
  writeFileSync(join(raiz, '.gga'), gga)
  writeFileSync(join(raiz, 'AGENTS.md'), '# Reglas de prueba\n- Módulos de menos de 200 líneas\n')
  return raiz
}

/** Alcance de un fichero inventado, con las líneas indicadas como cambiadas. */
export function alcanceDePrueba(ruta: string, lineas: number, desde: number, hasta: number): AlcanceFichero {
  const contenido = Array.from({ length: lineas }, (_, indice) => `const linea${indice + 1} = ${indice + 1}`).join('\n')
  return construirAlcance({ ruta, contenido, hunks: [{ desde, hasta, borradas: 0 }] })
}

/** Ejecutor falso: devuelve una respuesta por llamada y guarda lo que recibió. */
export function ejecutorFalso(respuestas: readonly string[]): EjecutorRevision & { llamadas: PeticionRevision[] } {
  const llamadas: PeticionRevision[] = []
  return {
    llamadas,
    revisar(peticion) {
      llamadas.push(peticion)
      const respuesta = respuestas[llamadas.length - 1]
      if (respuesta === undefined) {
        return { ok: false, motivo: 'sin respuesta preparada' }
      }
      return { ok: true, texto: respuesta }
    },
  }
}

export interface CorridaGate {
  codigo: number
  salida: string
  llamadas: number
  prompts: string[]
}

export function correrGate(
  respuestas: readonly string[],
  alcances: readonly AlcanceFichero[],
  extra: { pasadas?: number; reintentos?: number; gga?: string } = {},
): CorridaGate {
  const raiz = proyectoDePrueba(extra.gga)
  const ejecutor = ejecutorFalso(respuestas)
  const resultado = ejecutarGate({
    raiz,
    modo: 'staged',
    entorno: {},
    reintentos: extra.reintentos ?? 0,
    ...(extra.pasadas !== undefined ? { pasadas: extra.pasadas } : {}),
    cambio: {
      modo: 'staged',
      base: 'HEAD',
      ficheros: alcances.map((alcance) => alcance.ruta),
      alcances: [...alcances],
      ignorados: [],
    },
    ejecutor,
  })
  return {
    codigo: resultado.codigo,
    salida: resultado.salida,
    llamadas: ejecutor.llamadas.length,
    prompts: ejecutor.llamadas.map((llamada) => llamada.prompt),
  }
}
