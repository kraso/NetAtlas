import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/**
 * Configuración del gate: la misma que lee GGA (config global y `.gga`
 * versionado, este último manda) más los overrides por entorno que GGA también
 * respeta. Se parsea en vez de hacer `source` porque el wrapper no es bash:
 * solo se aceptan asignaciones `CLAVE="valor"`, que es lo que escribe el `.gga`.
 *
 * Los patrones, las reglas y el proveedor salen de aquí; el **presupuesto** no:
 * el `TIMEOUT` del `.gga` gobierna un `gga run` a mano, mientras que el tope de
 * cada pasada del gate es suyo (`TIMEOUT_POR_PASADA`), porque son dos pasadas.
 */
export interface ConfigGate {
  proveedor: string
  filePatterns: string
  excludePatterns: string
  rulesFile: string
  prBaseBranch: string
  opencodeVariant: string
  opencodeAgent: string
}

export const CONFIG_POR_DEFECTO: ConfigGate = {
  proveedor: '',
  filePatterns: '*',
  excludePatterns: '',
  rulesFile: 'AGENTS.md',
  prBaseBranch: '',
  opencodeVariant: '',
  opencodeAgent: '',
}

const CLAVES: ReadonlyArray<readonly [keyof ConfigGate, string]> = [
  ['proveedor', 'PROVIDER'],
  ['filePatterns', 'FILE_PATTERNS'],
  ['excludePatterns', 'EXCLUDE_PATTERNS'],
  ['rulesFile', 'RULES_FILE'],
  ['prBaseBranch', 'PR_BASE_BRANCH'],
  ['opencodeVariant', 'OPENCODE_VARIANT'],
  ['opencodeAgent', 'OPENCODE_AGENT'],
]

const OVERRIDES_ENTORNO: ReadonlyArray<readonly [keyof ConfigGate, string]> = [
  ['proveedor', 'GGA_PROVIDER'],
  ['opencodeVariant', 'GGA_OPENCODE_VARIANT'],
  ['opencodeAgent', 'GGA_OPENCODE_AGENT'],
]

/** Valores del fichero de configuración, sin comentarios ni comillas. */
export function parsearConfig(texto: string): Partial<ConfigGate> {
  const valores = new Map<string, string>()
  for (const linea of texto.split('\n')) {
    const limpia = linea.replace(/^\uFEFF/, '').trim()
    if (limpia === '' || limpia.startsWith('#')) {
      continue
    }
    const coincidencia = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(limpia)
    if (!coincidencia?.[1] || coincidencia[2] === undefined) {
      continue
    }
    valores.set(coincidencia[1], sinComillas(coincidencia[2].trim()))
  }
  const parcial: Partial<ConfigGate> = {}
  for (const [campo, clave] of CLAVES) {
    const valor = valores.get(clave)
    if (valor !== undefined) {
      parcial[campo] = valor
    }
  }
  return parcial
}

function sinComillas(valor: string): string {
  const comilla = valor[0]
  if ((comilla === '"' || comilla === "'") && valor.endsWith(comilla) && valor.length > 1) {
    return valor.slice(1, -1)
  }
  return valor
}

function asignar(destino: Partial<ConfigGate>, campo: keyof ConfigGate, valor: string): void {
  destino[campo] = valor
}

/** Global primero, `.gga` después (manda) y entorno al final, como GGA. */
export function resolverConfig(fuentes: {
  global?: string
  proyecto?: string
  entorno: NodeJS.ProcessEnv
}): ConfigGate {
  let config: ConfigGate = { ...CONFIG_POR_DEFECTO }
  for (const texto of [fuentes.global, fuentes.proyecto]) {
    if (texto !== undefined) {
      config = { ...config, ...parsearConfig(texto) }
    }
  }
  for (const [campo, variable] of OVERRIDES_ENTORNO) {
    const valor = fuentes.entorno[variable]
    if (valor !== undefined && valor !== '') {
      const override: Partial<ConfigGate> = {}
      asignar(override, campo, valor)
      config = { ...config, ...override }
    }
  }
  return config
}

/** Ruta del config global de GGA, con la misma prioridad que su `load_config`. */
export function rutaConfigGlobal(entorno: NodeJS.ProcessEnv): string | null {
  const appData = entorno['APPDATA']
  if (appData !== undefined && appData !== '') {
    return join(appData, 'gga', 'config')
  }
  const xdg = entorno['XDG_CONFIG_HOME']
  if (xdg !== undefined && xdg !== '') {
    return join(xdg, 'gga', 'config')
  }
  const hogar = entorno['HOME']
  if (hogar !== undefined && hogar !== '') {
    return join(hogar, '.config', 'gga', 'config')
  }
  return null
}

export function leerConfig(raiz: string, entorno: NodeJS.ProcessEnv): ConfigGate {
  const global = rutaConfigGlobal(entorno)
  return resolverConfig({
    ...(global !== null ? { global: leerOpcional(global) } : {}),
    proyecto: leerOpcional(join(raiz, '.gga')),
    entorno,
  })
}

/**
 * Texto del fichero de reglas (potestativamente fuera del repo, si `RULES_FILE`
 * es una ruta absoluta) que se le manda al proveedor dentro del prompt.
 */
export function leerReglas(raiz: string, config: ConfigGate): string {
  const ruta = isAbsolute(config.rulesFile) ? config.rulesFile : join(raiz, config.rulesFile)
  return readFileSync(ruta, 'utf8')
}

/** Un fichero de configuración ausente es normal; cualquier otro fallo rompe. */
function leerOpcional(ruta: string): string | undefined {
  try {
    return readFileSync(ruta, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw new Error(`No se pudo leer la configuración ${ruta}: ${String(error)}`)
  }
}
